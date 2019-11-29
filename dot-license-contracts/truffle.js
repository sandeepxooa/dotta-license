

module.exports = {
  // See <http://truffleframework.com/docs/advanced/configuration>
  // to customize your Truffle configuration!
  solc: {
    optimizer: {
      enabled: true,
      runs: 200
    }
  },
  
  compilers: {
    solc: {
      version: "0.4.19" // ex:  "0.4.20". (Default: Truffle's installed solc)
    }
 }
  
};
