import { SignProtocolClient, SpMode, EvmChains } from "@ethsign/sp-sdk";
import { privateKeyToAccount } from "viem/accounts";
import dotenv from "dotenv";
dotenv.config();

const signer = process.env.ATTESTATION_SIGNER;
const privateKey = process.env.ATTESTATION_PRIVATE_KEY;

const client = new SignProtocolClient(SpMode.OnChain, {
  chain: EvmChains.scrollSepolia,
  account: privateKeyToAccount(privateKey),
});

export const createDocumentAttestation = async (
  document_name,
  document_hash,
  ipfs_cid,
  attestor,
  submitter,
  compliance_status
) => {
  const res = await client.createAttestation({
    schemaId: "0x65a",
    data: {
      document_name,
      document_hash,
      ipfs_cid,
      attestor,
      submitter,
      compliance_status,
    },
    indexingValue: signer.toLowerCase(),
  });

  return res;
};
