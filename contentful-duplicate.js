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
      default: '<DEFAULT PERSONAL ACCESS TOKEN CAN BE ENTERED HERE>',
      validate: confirmAnswerRequired,
    },
    {
      type: 'list',
      name: 'singleLevel',
      message: '* Only duplicate \x1b[32msingle level\x1b[0m? (if set to true, only the first level entries will be duplicated): ',
      choices: ['false', 'true'],
      validate: confirmAnswerRequired,
    },
    {
      name: 'entries',
      message: '* Enter the \x1b[32mentry ID\x1b[0m you wish to duplicate: ',
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
      choices: ['duplication-testing', 'develop', 'staging', 'master'],
      validate: confirmAnswerRequired,
    },
    {
      type: 'list',
      name: 'targetEnvironment',
      message: '* Enter the \x1b[32mtarget environment\x1b[0m (environment you wish to duplicate to): ',
      choices: ['duplication-testing', 'develop', 'staging', 'master'],
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
      message: 'Enter a word to \x1b[32mfind\x1b[0m that you wish to replace (leave blank if not desired): ',
    },
    {
      name: 'replaceStr',
      message: 'Enter the value you wish to \x1b[32mreplace\x1b[0m with from the step above (leave blank if not desired): ',
    },
  ])
  .then(async (answers) => {
    let shouldContinue = true;

    await inquirer
      .prompt([
        {
          type: 'list',
          name: 'continueConfirmation',
          message: '\x1b[33mBefore continuing, please review the information entered and verify it is accurate. Do you want to continue?\x1b[0m',
          choices: ['exit', 'continue'],
        },
      ])
      .then((continueAnser) => {
        if (continueAnser.continueConfirmation === 'exit') {
          shouldContinue = false;
        }
      });

    if (answers.targetEnvironment === 'master' && shouldContinue) {
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
      values['single-level'] = answers.singleLevel === 'true';
      values['target-space-id'] = '';

      duplicate(values);
    }
  });
