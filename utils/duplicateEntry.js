const { warning } = require('contentful-cli/dist/utils/log');
const ora = require('ora');
const { FIELD_NAME } = require('../shared/constants');
const constants = require('../shared/constants');
const error = require('./error');

let startingEntryId;
const duplicatedEntries = [];
const originalToDuplicates = [];
const loopReferences = [];

const getEntryName = (entry) => {
  for (const key in entry.fields) {
    if (FIELD_NAME.includes(key)) {
      return entry.fields[key]['en-US'];
    }
  }
  return null;
};

const getFieldObj = (object, key, expectedValue) => {
  let value;
  Object.keys(object).some((k) => {
    if (k === key && object[k] === expectedValue) {
      value = object;
      return true;
    }
    if (object[k] && typeof object[k] === 'object') {
      value = getFieldObj(object[k], key, expectedValue);
      return value !== undefined;
    }

    return null;
  });
  return value;
};

/**
 * Handles any duplicated content items that are loop references. Finds these entries and updates
 * the reference to the newly created duplicate item
 */
const handleLoopReferences = (targetEnvironment) => {
  // Correct any loop references to point at the duplicated content instead of the original
  for (const ref of loopReferences) {
    if (!ref.completed) {
      const originalToDuplicateRef = originalToDuplicates
        .find(oToD => oToD.originalId === ref.parentId);
      if (originalToDuplicateRef) {
        targetEnvironment.getEntry(originalToDuplicateRef.duplicateId)
          // eslint-disable-next-line no-loop-func
          .then((entryToBeAdjusted) => {
            if (entryToBeAdjusted) {
              // Find the originalId in the fields objects in order to update it
              const objectToBeUpdated = getFieldObj(entryToBeAdjusted.fields, 'id', ref.childId);

              // Get child original id and find duplicate id
              const childRef = originalToDuplicates.find(oToD => oToD.originalId === ref.childId);

              // Update object with duplicated ID to fix the content reference
              // objectToBeUpdated.id = originalToDuplicateRef.duplicateId;
              objectToBeUpdated.id = childRef.duplicateId;

              entryToBeAdjusted.update();

              ref.completed = true;
            }
          })
          .catch(err => error(err.message, true));
      }
    }
  }
};

/**
 * Duplicate an entry recursively
 *
 * @param {string} entryId - Entry ID
 * @param {string} environment - Source Environment
 * @param {boolean} publish - Publish Entry after duplicate or not,
 * the created entry's status is the same with the original entry,
 * set false to force the created entry to be draft although the original entry is published.
 * @param {Array} exclude - Array of Entry IDs that will be excluded
 * @param {boolean} isSingleLevel - If true, then it's no need to clone sub entries, just link
 * @param {string} targetEnvironment - Target Environment
 * @param {string} prefix - Prefix of the created entry name
 * @param {string} suffix - Suffix of the created entry name
 * @param {RegExp} regex - Regex pattern of the created entry name
 * @param {string} replaceStr - String replace for the created entry name
 */
const duplicateEntry = async (
  entryId, environment, publish, exclude, isSingleLevel, targetEnvironment,
  prefix, suffix, regex, replaceStr, targetContentTypes, parentEntryId) => {
  const spinner = ora().start();

  if (!parentEntryId) {
    startingEntryId = entryId;
  }

  if (!exclude.includes(entryId)) {
    if (!duplicatedEntries.includes(entryId)) {
      duplicatedEntries.push(entryId);
      // get the entry by id
      const entry = await environment.getEntry(entryId).catch(err => error(err.message, true));

      // clone entry fields value
      const newEntryFields = {
        ...entry.fields,
      };

      /* eslint-disable no-await-in-loop */
      for (const field of Object.keys(newEntryFields)) {
        // apply the new name for the new entry (if needed)
        if (FIELD_NAME.includes(field)) {
          for (const localeKey of Object.keys(newEntryFields[field])) {
            let createdName = newEntryFields[field][localeKey];

            if (regex && replaceStr) {
              createdName = createdName.replace(regex, replaceStr);
            }

            createdName = prefix + createdName + suffix;

            newEntryFields[field][localeKey] = createdName;
          }
        } else {
          // iterates through other fields,
          // if the field contains a link to another entry, then duplicate
          const fieldContent = entry.fields[field];

          for (const fieldContentKey of Object.keys(fieldContent)) {
            const fieldContentValue = fieldContent[fieldContentKey];

            if (!isSingleLevel && (Array.isArray(fieldContentValue) || (fieldContentValue instanceof Object && 'sys' in fieldContentValue))) {
              if (Array.isArray(fieldContentValue)) {
                for (const [, content] of fieldContentValue.entries()) {
                  if (content
                    && content.sys
                    && content.sys.type === constants.LINK_TYPE
                    && content.sys.linkType === constants.ENTRY_TYPE
                    && !exclude.includes(content.sys.id)) {
                    spinner.info(`Duplicating sub entry #${content.sys.id}`);

                    const duplicatedEntry = await duplicateEntry(
                      content.sys.id, environment, publish, exclude, isSingleLevel,
                      targetEnvironment, prefix, suffix, regex, replaceStr,
                      targetContentTypes, entryId,
                    );

                    if (duplicatedEntry !== null) {
                      content.sys.id = duplicatedEntry.sys.id;
                    }
                  }
                }
              } else if (fieldContentValue instanceof Object && 'sys' in fieldContentValue) {
                if (fieldContentValue.sys.type === constants.LINK_TYPE
                  && fieldContentValue.sys.linkType === constants.ENTRY_TYPE
                  && !exclude.includes(fieldContentValue.sys.id)) {
                  spinner.info(`Duplicating sub entry #${fieldContentValue.sys.id}`);

                  const duplicatedEntry = await duplicateEntry(
                    fieldContentValue.sys.id, environment, publish, exclude, isSingleLevel,
                    targetEnvironment, prefix, suffix, regex, replaceStr, targetContentTypes,
                    entryId,
                  );

                  if (duplicatedEntry !== null) {
                    fieldContentValue.sys.id = duplicatedEntry.sys.id;
                  }
                }
              }
            }

            newEntryFields[field][fieldContentKey] = fieldContentValue;
          }
        }
      }
      /* eslint-enable no-await-in-loop */

      // create new entry
      const newEntry = targetEnvironment.createEntry(entry.sys.contentType.sys.id, {
        fields: newEntryFields,
      }).then((e) => {
        spinner.stop();
        originalToDuplicates.push({ originalId: entryId, duplicateId: e.sys.id });
        return e;
      }).catch((err) => {
        spinner.stop();
        error(err.message, true);
      });

      // check if the new entry need to publish or not
      if (publish) {
        if (targetEnvironment && 'name' in targetEnvironment && !targetEnvironment.name.includes('master')) {
          if (entry.isPublished()) {
            // if the entry's content type has a required asset field,
            // then the entry will be draft.
            const contentType = targetContentTypes.items.find(
              item => item.sys.id === entry.sys.contentType.sys.id,
            );

            let canPublish = true;
            for (const f of contentType.fields) {
              if (f.linkType === constants.ASSET_TYPE && f.required) {
                const entryFieldObject = entry.fields[f.id];

                /* eslint-disable no-await-in-loop */
                for (const entryFieldKey of Object.keys(entryFieldObject)) {
                  const entryFieldValue = entryFieldObject[entryFieldKey];

                  /* eslint-disable no-loop-func */
                  await targetEnvironment.getAsset(entryFieldValue.sys.id).catch(() => {
                    canPublish = false;
                  });
                  /* eslint-enable no-loop-func */
                }
                /* eslint-enable no-await-in-loop */
              }
            }

            if (canPublish) {
              newEntry.then(e => e.publish()).catch(() => error('Unable to publish entry. This is likely due to some validation error on the content.', false));
            }
          }
        }
      }

      if (startingEntryId === entryId) handleLoopReferences(targetEnvironment);

      return newEntry;
    // eslint-disable-next-line no-else-return
    } else {
      const parentEntry = await environment
        .getEntry(parentEntryId)
        .catch(err => error(err.message, true));
      const childEntry = await environment
        .getEntry(entryId)
        .catch(err => error(err.message, true));

      loopReferences.push({ parentId: parentEntryId, childId: entryId });

      const parentName = getEntryName(parentEntry);
      const childName = getEntryName(childEntry);

      warning(`Content loop found between entry [${parentName} - ID #${parentEntry.sys.id}] and entry [${childName} - ID #${childEntry.sys.id}].`);
    }
  }

  if (startingEntryId === entryId) handleLoopReferences(targetEnvironment);

  spinner.stop();
  return null;
};

module.exports = duplicateEntry;
