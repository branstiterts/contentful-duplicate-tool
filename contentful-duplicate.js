const inquirer = require('inquirer');
const duplicate = require('./cmds/duplicate');


const confirmAnswerRequired = async (input) => {
  if (input === null || input === undefined || input === '') {
    return 'Answer is required.';
  }
  return true;
};

const values = {};

inquirer
  .prompt([
    {
      name: 'spaceId',
      message: '* Enter your Contentful \x1b[32mSpace ID\x1b[0m: ',
      default: '<DEFAULT SPACE ID CAN BE ENTERED HERE>',
      validate: confirmAnswerRequired,
    },
    {
      name: 'mToken',
      message: '* Enter your Contentful \x1b[32mPersonal Access Token\x1b[0m: ',
      default: '<DEFAULT TOKEN CAN BE ENTERED HERE>',
      validate: confirmAnswerRequired,
    },
    {
      name: 'entries',
      message: '* Enter the \x1b[32mentry / entries ID\x1b[0m you wish to duplicate (use commas to separate multiple IDs): ',
      validate: confirmAnswerRequired,
    },
    {
      name: 'exclude',
      message: 'Enter the \x1b[32mentry / entries ID\x1b[0m you wish to \x1b[4mexclude\x1b[0m (use commas to separate multiple IDs): ',
    },
    {
      type: 'list',
      name: 'environment',
      message: '* Enter the \x1b[32msource environment\x1b[0m (environment the entry / entries are located): ',
      choices: ['develop', 'staging', 'master'],
      validate: confirmAnswerRequired,
    },
    {
      type: 'list',
      name: 'targetEnvironment',
      message: '* Enter the \x1b[32mtarget environment\x1b[0m (environment you wish to duplicate to): ',
      choices: ['develop', 'staging', 'master'],
      validate: confirmAnswerRequired,
    },
    {
      type: 'list',
      name: 'publish',
      message: '* Do you wish to \x1b[32mpublish\x1b[0m the duplicated entries?: ',
      choices: ['false', 'true'],
      validate: confirmAnswerRequired,
    },
    {
      name: 'prefix',
      message: 'Enter a \x1b[32mprefix\x1b[0m (leave blank if not desired): ',
    },
    {
      name: 'suffix',
      message: 'Enter a \x1b[32msuffix\x1b[0m (leave blank if not desired): ',
    },
    {
      name: 'regexPattern',
      message: 'Enter a \x1b[32mregex pattern\x1b[0m you wish to replace (leave blank if not desired): ',
    },
    {
      name: 'replaceStr',
      message: 'Enter a \x1b[32mvalue\x1b[0m you wish to use in place of your regex pattern (leave blank if not desired): ',
    },
  ])
  .then(async (answers) => {
    let shouldContinue = true;
    if (answers.targetEnvironment === 'master') {
      await inquirer
        .prompt([
          {
            type: 'list',
            name: 'masterConfirmation',
            message: '\x1b[31mYOU ARE ABOUT TO DUPLICATE CONTENT TO [MASTER] ENVIRONMENT. ARE YOU SURE YOU WANT TO CONTINUE?\x1b[0m',
            choices: ['NO! This was a mistake.', 'YES - I know what I am doing.'],
          },
        ])
        .then((confirmation) => {
          if (confirmation.masterConfirmation.includes('NO!')) {
            shouldContinue = false;
          }
        });
    }
    if (shouldContinue) {
      values['space-id'] = answers.spaceId;
      values.mToken = answers.mToken;
      values.entries = answers.entries;
      values.environment = answers.environment;
      values['target-environment'] = answers.targetEnvironment;
      values.publish = answers.publish === 'true';
      values.exclude = answers.exclude;
      values.prefix = answers.prefix;
      values.suffix = answers.suffix;
      values['regex-pattern'] = answers.regexPattern;
      values['replace-str'] = answers.replaceStr;
      values['single-level'] = false;
      values['target-space-id'] = '';

      duplicate(values);
    }
  });
