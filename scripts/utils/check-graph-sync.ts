import { ethers } from 'hardhat';
import { ApolloClient, createHttpLink, InMemoryCache } from '@apollo/client/core';
import { gql } from '@apollo/client';

const SUBGRAPH = 'https://graph.tetu.io/subgraphs/name/tetu-io/sacra-staging-sepolia2';

async function main() {
  const provider = ethers.provider;

  const client = new ApolloClient({
    link: createHttpLink({
      uri: SUBGRAPH,
      fetch,
    }),
    cache: new InMemoryCache(),
  });

  const { data } = await client.query({
    query: gql`
        query GraphData {
            _meta {
                deployment
                hasIndexingErrors
                block {
                    hash
                    number
                    timestamp
                }
            }
        }

    `,
  });
  const graphMeta = data._meta;

  if (graphMeta.hasIndexingErrors) {
    throw Error('Graph has indexing errors');
  }

  const currentBlock = await provider.getBlockNumber();
  const graphBlock = graphMeta.block.number;

  console.log('currentBlock', currentBlock);
  console.log('graphBlock', graphBlock);

  if (currentBlock - graphBlock > 10) {
    throw Error('Graph is not synced');
  }

  console.log('Graph is synced');
}


main()
  .then(() => process.exit(0))
  .catch(error => {
    console.error(error);
    process.exit(1);
  });
