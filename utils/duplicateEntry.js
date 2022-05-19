const { warning } = require('contentful-cli/dist/utils/log');
const ora = require('ora');
const constants = require('../shared/constants');
const error = require('./error');

const duplicatedEntries = [];

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
  prefix, suffix, regex, replaceStr, targetContentTypes) => {
  const spinner = ora().start();

  if (!exclude.includes(entryId) && !duplicatedEntries.includes(entryId)) {
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
      if (constants.FIELD_NAME.includes(field)) {
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
              for (const [contentIndex, content] of fieldContentValue.entries()) {
                if (content.sys.type === constants.LINK_TYPE
                  && content.sys.linkType === constants.ENTRY_TYPE
                  && !exclude.includes(content.sys.id)) {
                  spinner.info(`Duplicating sub entry #${content.sys.id}`);

                  const duplicatedEntry = await duplicateEntry(
                    content.sys.id, environment, publish, exclude, isSingleLevel, targetEnvironment,
                    prefix, suffix, regex, replaceStr, targetContentTypes,
                  );
                  if ('sys' in fieldContentValue && 'id' in fieldContentValue) {
                    fieldContentValue[contentIndex].sys.id = duplicatedEntry.sys.id;
                    duplicatedEntries.push(duplicateEntry.sys.id);
                  }
                }
              }
            } else if (fieldContentValue instanceof Object && 'sys' in fieldContentValue) {
              if (fieldContentValue.sys.type === constants.LINK_TYPE
                && fieldContentValue.sys.linkType === constants.ENTRY_TYPE
                && !exclude.includes(fieldContentValue.sys.id)) {
                spinner.info(`Duplicating sub entry #${fieldContentValue.sys.id}`);

                const duplicatedEntry = await duplicateEntry(
                  fieldContentValue.sys.id, environment, publish, exclude, isSingleLevel, targetEnvironment,
                  prefix, suffix, regex, replaceStr, targetContentTypes,
                );
                if ('sys' in fieldContentValue && 'id' in fieldContentValue) {
                  fieldContentValue.sys.id = duplicatedEntry.sys.id;
                  duplicatedEntries.push(duplicateEntry.sys.id);
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

    return newEntry;
  }

  spinner.stop();
  return null;
};

module.exports = duplicateEntry;
