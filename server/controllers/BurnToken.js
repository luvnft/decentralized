import TokenModel from "../models/TokenModel.js";
import UserModel from "../models/UserModel.js";
import Sdk, { CHAIN_CONFIG } from "@unique-nft/sdk";

export const burnToken = async (req, res) => {
  const { collectionId, tokenId } = req.body;
  const userId = req.user.id;
  const sdk = new Sdk({
    baseUrl: CHAIN_CONFIG.opal.restUrl,
    signer: account,
  });
  try {
    const user = await UserModel.findById(userId);
    const txBurn = await sdk.token.burn.submitWaitResult({
      collectionId,
      tokenId,
      address: user.accountAddress,
    });
    await TokenModel.findOneAndDelete({
      tokenOwnerAddress: user.accountAddress,
      tokenOwnerId: user._id,
    });
    res.status(200).json({
      success: true,
      message: `Token ${txBurn.parsed?.tokenId} was burned in the collection ${txBurn.parsed?.collectionId}`,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      message: error.message,
    });
  }
};
