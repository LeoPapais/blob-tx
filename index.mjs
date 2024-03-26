import { ethers } from "ethers"
import * as dotenv from "dotenv"
import * as path from 'path'
import pkg from 'c-kzg'
import axios from 'axios'
import { Common, Hardfork } from '@ethereumjs/common'
import { BlobEIP4844Transaction } from '@ethereumjs/tx'

const {
    blobToKzgCommitment,
    computeBlobKzgProof,
    loadTrustedSetup
  } = pkg;

const common = new Common({
  chain: 1,
  hardfork: Hardfork.Cancun,
  eips: [4844],
  customCrypto: { kzg: pkg }
})

dotenv.config();

const ownerPrivateKey = process.env.OWNER_PK;
const rpcUrl = process.env.RPC_URL;

// Setup provider, wallet
const provider = new ethers.JsonRpcProvider(rpcUrl);
const signer = new ethers.Wallet(ownerPrivateKey, provider);

async function sendRawTransaction() {
    const from = await signer.getAddress();
    const to = await ethers.Wallet.createRandom().getAddress();
    const nonce = await provider.getTransactionCount(from, 'pending');
    const feeData = await provider.getFeeData();

    const BYTES_PER_BLOB = 4096 * 32
    const newBlob = Buffer.concat([
        Buffer.from('SUA STRING AQUI'),
        Buffer.alloc(BYTES_PER_BLOB, " ")
    ]).slice(0, BYTES_PER_BLOB)
    loadTrustedSetup(path.resolve("trusted_setup.txt"))
    const commitment = blobToKzgCommitment(newBlob)
    const proof = computeBlobKzgProof(newBlob, commitment)
    
    const txData = {
        chainId: ethers.toBeHex(1),
        nonce: ethers.toBeHex(nonce),
        maxPriorityFeePerGas: ethers.toBeHex(feeData.maxPriorityFeePerGas),
        maxFeePerGas: ethers.toBeHex(feeData.maxFeePerGas),
        maxFeePerBlobGas: '0xfff',
        gasLimit: "0x5680",
        to,
        value: "0x00",
        data: "0x",
        type: '0x03',
        accessList: [],
        blobVersionedHashes: ["0x01" + ethers.sha256(commitment).substr(4, 64)],
        kzgCommitments: [ethers.hexlify(commitment)],
        blobs: [newBlob],
        kzgProofs: [ethers.hexlify(proof)]
    };

    const tx = BlobEIP4844Transaction.fromTxData(txData, { common })    
    const signedTx = tx.sign(Buffer.from(ownerPrivateKey, 'hex'))

    const rawTx = ethers.hexlify(signedTx.serializeNetworkWrapper())
    const data = JSON.stringify(
        {
            "jsonrpc": "2.0",
            "method": "eth_sendRawTransaction",
            "params": [rawTx],
            "id": 1
        }
    )
    
    const res = await axios({
        method: 'post',
        url: process.env.RPC_URL,
        data
    })

    return res;
}

sendRawTransaction()
    .then(res => console.log(res))
    .catch(error => console.error(error));