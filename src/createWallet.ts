import {
  Hex,
  Transport,
  createWalletClient,
  fromHex,
  publicActions,
  LocalAccount,
  http,
  recoverTypedDataAddress,
  verifyTypedData,
  toHex,
} from "viem";
import * as chains from "viem/chains";

export type Wallet = ReturnType<typeof createWallet>;
interface BigInt {
  /** Convert to BigInt to string form in JSON.stringify */
  toJSON: () => string;
}
// @ts-expect-error Polyfill method
// eslint-disable-next-line no-extend-native
BigInt.prototype.toJSON = function () {
  return this.toString();
};
export function createWallet(
  account: LocalAccount,
  transports: Map<number, Transport>,
) {
  let chainId: string | undefined;
  let localAccount: LocalAccount = account;
  return {
    request: async ({
      method,
      params,
    }: {
      method: string;
      params?: Array<unknown>;
    }) => {
      try {
        let chain = getChain(chainId);
        const client = createWalletClient({
          account,
          chain: chain,
          transport: transports.get(chain.id) ?? http(),
        }).extend(publicActions);
        if (method === "eth_accounts" || method === "eth_requestAccounts") {
          return await client.getAddresses();
        }

        if (
          method === "wallet_requestPermissions" ||
          method === "wallet_revokePermissions"
        ) {
          return [{ parentCapability: "eth_accounts" }];
        }

        if (method === "wallet_switchEthereumChain") {
          chainId = (params?.[0] as any).chainId;
          return null;
        }

        if (method === "personal_sign") {
          if (!client.account.signMessage)
            throw new Error("Method `personal_sign` not supported by account");
          return await client.account.signMessage({
            message: {
              raw: params?.[0] as Hex,
            },
          });
        }

        if (method === "eth_chainId") {
          const chainIdResult = chainId ?? toHex(1);
          console.log("Returning: eth_chainId", chainIdResult);
          return chainIdResult;
        }

        if (method === "eth_sendRawTransaction") {
          console.log("eth_sendRawTransaction", params);
          return await client.sendRawTransaction({
            serializedTransaction: params?.[0] as any,
          });
        }

        if (
          method === "eth_signTypedData_v4" ||
          method === "eth_signTypedData" ||
          method === "eth_signTypedData_v3"
        ) {

          // SANITY CHECK 
          const EIP712Domain = [
            { name: 'name', type: 'string' },
            { name: 'version', type: 'string' },
            { name: 'chainId', type: 'uint256' },
            { name: 'verifyingContract', type: 'address' },
          ];
          const msgParams = {
            domain: {
              chainId: getChain(chainId).id,
              name: 'Ether Mail',
              verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
              version: '1',
            },
            message: {
              contents: 'Hello, Bob!',
              from: {
                name: 'Cow',
                wallets: [
                  '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
                  '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF',
                ],
              },
              to: [
                {
                  name: 'Bob',
                  wallets: [
                    '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
                    '0xB0BdaBea57B0BDABeA57b0bdABEA57b0BDabEa57',
                    '0xB0B0b0b0b0b0B000000000000000000000000000',
                  ],
                },
              ],
              attachment: '0x',
            },
            primaryType: 'Mail',
            types: {
              EIP712Domain,
              Group: [
                { name: 'name', type: 'string' },
                { name: 'members', type: 'Person[]' },
              ],
              Mail: [
                { name: 'from', type: 'Person' },
                { name: 'to', type: 'Person[]' },
                { name: 'contents', type: 'string' },
                { name: 'attachment', type: 'bytes' },
              ],
              Person: [
                { name: 'name', type: 'string' },
                { name: 'wallets', type: 'address[]' },
              ],
            },
          };
          const asd = await localAccount.signTypedData(msgParams as any);
          console.log("Signature Sanity", asd);
          const validSanity = await verifyTypedData({
            address: localAccount.address,
            domain: { 
              name: 'Ether Mail',
              version: '1',
              chainId: 1 as any as bigint,
              verifyingContract: '0xCcCCccccCCCCcCCCCCCcCcCccCcCCCcCcccccccC',
            } as any,
            types: {
              EIP712Domain,
              Group: [
                { name: 'name', type: 'string' },
                { name: 'members', type: 'Person[]' },
              ],
              Mail: [
                { name: 'from', type: 'Person' },
                { name: 'to', type: 'Person[]' },
                { name: 'contents', type: 'string' },
                { name: 'attachment', type: 'bytes' },
              ],
              Person: [
                { name: 'name', type: 'string' },
                { name: 'wallets', type: 'address[]' },
              ],
            },
            primaryType: 'Mail',
            message: {
              contents: 'Hello, Bob!',
              from: {
                name: 'Cow',
                wallets: [
                  '0xCD2a3d9F938E13CD947Ec05AbC7FE734Df8DD826',
                  '0xDeaDbeefdEAdbeefdEadbEEFdeadbeEFdEaDbeeF',
                ],
              },
              to: [
                {
                  name: 'Bob',
                  wallets: [
                    '0xbBbBBBBbbBBBbbbBbbBbbbbBBbBbbbbBbBbbBBbB',
                    '0xB0BdaBea57B0BDABeA57b0bdABEA57b0BDabEa57',
                    '0xB0B0b0b0b0b0B000000000000000000000000000',
                  ],
                },
              ],
              attachment: '0x',
            },
            signature: asd,
          });
          console.log(`Valid Sanity: ${validSanity}`);
          // SANITY CHECK END 
          if (!client.account.signTypedData) throw new Error("Method `eth_signTypedData` not supported by account");
          const from = (params?.[0] as any);
          if (from !== localAccount.address) throw new Error("Invalid from address");
          const { account, domain, types, primaryType, message } = JSON.parse(
            params?.[1] as string,
          ) as any;
          const parsedAmount = message.amount && BigInt(message.amount);
          if (parsedAmount) {
            message.amount = parsedAmount;
          }

          const domainChainId = getChain(chainId).id;
          console.log("Domain Chain ID", domainChainId);
          domain.chainId = domainChainId;
          const signedTypeDataParams = {
            domain: { 
              ...domain,
              chainId: domainChainId,
            },
            types,
            primaryType,
            message,
          };
          console.log(signedTypeDataParams);
          const signature =
            await localAccount.signTypedData(signedTypeDataParams);
          console.log("Signature", signature);
          const valid = await verifyTypedData({
            address: localAccount.address,
            domain,
            types,
            primaryType: 'Mail',
            message,
            signature,
          });
          console.log(`Signature valid: ${valid}`);
          const recoveredAddress = await recoverTypedDataAddress({ 
            domain: domain,
            types: types,
            primaryType: 'Mail',
            message: message,
            signature,
          });
          console.log(`Recovered Address: ${recoveredAddress}`);
          return signature;
        }

        if (method === "eth_sendTransaction") {
          const from = (params?.[0] as any).from;
          if (from !== account.address) throw new Error("Invalid from address");
          const { to, data } = params?.[0] as any;
          let { value, maxFeePerGas, maxPriorityFeePerGas, gas, gasPrice } =
            params?.[0] as any;
          value = value && BigInt(value);
          gas = gas && BigInt(gas);
          gasPrice = gasPrice && BigInt(gasPrice);
          maxFeePerGas = maxFeePerGas && BigInt(maxFeePerGas);
          maxPriorityFeePerGas =
            maxPriorityFeePerGas && BigInt(maxPriorityFeePerGas);
          return await client.sendTransaction({
            to,
            value,
            data,
            gas,
            gasPrice,
            maxFeePerGas,
            maxPriorityFeePerGas,
          });
        }

        return await client.request({
          method: method as any,
          params: params as any,
        });
      } catch (error) {
        console.error("Error within Mock Wallet:", error);
        return null;
      }
    },
  };
}

function getChain(chainIdHex: string | undefined) {
  if (!chainIdHex) return chains.mainnet;

  const chainId = fromHex(chainIdHex as Hex, "number");
  for (const chain of Object.values(chains)) {
    if ("id" in chain) {
      if (chain.id === chainId) {
        return chain;
      }
    }
  }

  return chains.mainnet;
}
