const debug = require('debug')('dotcli');
const fs = require('fs');
const Bluebird = require('bluebird');
const _ = require('lodash');
const chalk = require('chalk');
const FauxSubscriptionSubprovider = require('./FauxSubscriptionSubprovider');
let _engine;
const configure = require('./config');

const handleResponse = (response, argv, abi, functionAbi) => {
  return response
    .once('transactionHash', function(hash) {
      console.log('transactionHash', hash);
    })
    .once('receipt', function(receipt) {
      console.log('receipt once', receipt);
    })
    .once('confirmation', function(confNumber, receipt) {
      console.log('Confirmation', confNumber);
      console.log('Blockhash', receipt.blockHash);
      console.log('Receipt', receipt);

      // TODO, bubble this up
      process.exit(0);
    })
    .on('error', function(error) {
      console.log('error', error);
    });
};

const handleRead = async (argv, abi, functionAbi, web3) => {
  const contract = new web3.eth.Contract(abi, argv.contractAddress);
  const response = await contract.methods[functionAbi.name]().call();
  console.log(response);
};

const handleWrite = async (argv, abi, functionAbi, web3) => {
  const contract = new web3.eth.Contract(abi, argv.contractAddress);

  const accounts = await web3.eth.getAccountsAsync();
  const from = argv.from || accounts[0];
  const transactionArguments = (functionAbi.inputs || []).map(
    input => argv[input.name]
  );

  // build sendOpts
  const sendOpts = {
    from
  };

  if (argv.gasPrice) sendOpts.gasPrice = argv.gasPrice;
  if (argv.gasLimit) sendOpts.gas = argv.gasLimit;
  if (argv.value) sendOpts.value = argv.value;

  if (argv.ledger) {
    console.log(
      chalk.yellow('Please confirm transaction on device:'),
      JSON.stringify(
        _.merge(
          {
            method: functionAbi.name,
            args: transactionArguments
          },
          sendOpts
        ),
        null,
        2
      )
    );
  }
  const response = contract.methods[functionAbi.name](
    ...transactionArguments
  ).send(sendOpts);
  return handleResponse(response);
};

const buildAbiCommands = (yargs, pathToFile, opts, handler) => {
  let combined = JSON.parse(fs.readFileSync(pathToFile));

  let contracts = _.reduce(
    combined.contracts,
    (acc, attributes, rawName) => {
      if (attributes.abi) {
        let name = rawName.split(':')[1];
        acc[name] = {
          abi: JSON.parse(attributes.abi),
          devdoc: JSON.parse(attributes.devdoc),
          userdoc: JSON.parse(attributes.userdoc)
        };
      }
      return acc;
    },
    {}
  );

  const sanitizeParam = p => p.replace(/^_/, '');
  const sp = sanitizeParam;

  const docName = iface => {
    const argumentTypes = iface.inputs.map(i => i.type);
    return iface.name + '(' + argumentTypes.join(',') + ')';
  };

  const buildCommands = contract => {
    let abiFunctions = contract.abi
      .filter(iface => iface.type === 'function')
      .filter(iface => !_.get(opts, ['methods', docName(iface), 'skip']));

    abiFunctions.forEach(iface => {
      const userdoc =
        _.get(contract.userdoc, ['methods', docName(iface)]) ||
        _.get(opts, ['methods', docName(iface), 'userdoc']);
      const devdoc = _.get(contract.devdoc, ['methods', docName(iface)], {});

      // doc required
      if (!userdoc) {
        debug('no userdoc for' + iface.name);
        return;
      }

      let positionalArgumentsString = _.keys(devdoc.params)
        .map(p => `<${sp(p)}>`)
        .join(' ');
      let commandString = _.compact([
        iface.name,
        positionalArgumentsString
      ]).join(' ');

      yargs.command(
        commandString,
        userdoc.notice,
        yargs => {
          iface.inputs.forEach(input => {
            const description = _.get(devdoc, ['params', sp(input.name)]);
            yargs.positional(sp(input.name), {
              describe: description
            });
            yargs.demand(sp(input.name));
            if (input.name != sp(input.name)) {
              yargs.alias(sp(input.name), input.name);
            }
            // TODO add:
            // * type parsing
            // * input validation (addresses)
          });
          if (iface.payable) {
            yargs.demand('value');
          }
        },
        async argv => {
          let web3 = await configure(argv);
          debug(JSON.stringify(iface, null, 2));
          if (iface.constant) {
            await handleRead(argv, contract.abi, iface, web3);
          } else {
            await handleWrite(argv, contract.abi, iface, web3);
          }
          // _engine.stop();
        }
      );
    });
  };

  const buildCommandsFor = opts.contracts
    ? _.values(_.pick(contracts, opts.contracts))
    : _.values(contracts);
  buildCommandsFor.forEach(c => buildCommands(c));
};

module.exports = buildAbiCommands;
