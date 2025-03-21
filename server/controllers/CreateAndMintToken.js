import Sdk from "@unique-nft/sdk";
import { KeyringProvider } from "@unique-nft/accounts/keyring";
import CollectionModel from "../models/CollectionModel.js";
import TokenModel from "../models/TokenModel.js";
import UserModel from "../models/UserModel.js";
import SpecialTokenModel from "../models/SpecialToken.js";
// import { usdToUnq } from '../utils/currencyConverter.js';

// Controller to create a new collection
export const createCollectionController = async (req, res) => {
  const { tokenPrefix, name, description, collectionImageUrl } = req.body;
  const userId = req.user.id;

  try {
    // Find the user by ID
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    // Get the mnemonic from the user
    const mnemonic = user.mnemonic;
    if (!mnemonic) {
      return res.status(400).json({
        success: false,
        message: "User mnemonic not found",
      });
    }

    // Find an account from the user's mnemonic
    const account = await KeyringProvider.fromMnemonic(mnemonic);
    const address = account.address;

    // Initialize the SDK
    const sdk = new Sdk({
      baseUrl: "https://rest.unique.network/opal/v1",
      signer: account,
    });

    // Create a new collection
    const { parsed, isCompleted } =
      await sdk.collection.create.submitWaitResult({
        address,
        name,
        description,
        tokenPrefix,
        permissions: {
          nesting: {
            tokenOwner: true,
            collectionAdmin: true,
          },
        },
      });

    console.log(isCompleted);

    // if (error) {
    //   return res.status(500).json({
    //     success: false,
    //     message: "An error occurred while creating the collection",
    //     error: error,
    //   });
    // }

    if (!isCompleted) {
      return res.status(500).json({
        success: false,
        message: "Collection creation failed",
      });
    }

    const { collectionId } = parsed;

    const collection = await sdk.collection.get({ collectionId });

    // Create a new collection document in the database
    const collectionPayload = await CollectionModel.create({
      collectionOwner: user._id,
      collectionId,
      collectionUrl: `https://uniquescan.io/opal/collections/${collectionId}`,
      walletAddress: address,
      name,
      description,
      collectionImageUrl,
    });

    res.status(200).json({
      success: true,
      message: "Collection created successfully",
      collectionPayload,
    });
  } catch (error) {
    7;
    res.status(500).json({
      success: false,
      message: "An error occurred while creating the collection",
      error: error.message ? error.message : error,
    });
  }
};

// Controller to mint a new token in an existing collection
export const mintToken = async (req, res) => {
  const {
    collectionId,
    tokenName,
    tokenDescription,
    tokenImageUrl,
    category,
    priceOfCoupon,
    isItem,
  } = req.body;

  const validCategories = ["pizza", "coffee", "delivery"];
  if (!validCategories.includes(category)) {
    return res.status(400).json({
      success: false,
      message: "Invalid category. Must be one of: pizza, coffee, delivery",
    });
  }

  const userId = req.user.id;

  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }
    // Get mnemonic from logged in user
    const mnemonic = user.mnemonic;
    if (!mnemonic) {
      return res.status(400).json({
        success: false,
        message: "User mnemonic not found",
      });
    }
    // Find an account from the user's mnemonic
    const account = await KeyringProvider.fromMnemonic(mnemonic);
    const address = account.address;

    
    // Initialize the SDK
    const sdk = new Sdk({
      baseUrl: "https://rest.unique.network/opal/v1",
      signer: account,
    });

    // Mint a new token
    const result = await sdk.token.create.submitWaitResult({
      address,
      collectionId,
      data: {
        // image: {
        //   ipfsCid: tokenImageUrl,
        // },
        name: {
          _: tokenName,
        },
        description: {
          _: tokenDescription,
        },
      },
    });

    const tokenId = result.parsed.tokenId;
    console.log(`This is the tokenId: ${tokenId}`);
    const mintTokenCompleted = result.isCompleted;
    console.log(`Token minting completed: ${mintTokenCompleted}`);

    if (mintTokenCompleted) {
      // const unqPrice = usdToUnq(priceOfCoupon);

      const mintToken = await TokenModel.create({
        tokenName,
        tokenId,
        collectionId,
        tokenImageUrl,
        category,
        tokenOwnerAddress: user.accountAddress,
        tokenOwnerId: user._id,
        tokenDescription,
        priceOfCoupon: Number(priceOfCoupon).toFixed(2),
        tokenUrl: `https://uniquescan.io/opal/tokens/${collectionId}/${tokenId}`,
        metadata: {
          storeAddress: user.accountAddress,
          storeId: user._id,
        },
        isItem,
      });

      // Update the collection to include the new token
      await CollectionModel.findOneAndUpdate(
        { collectionId },
        { $push: { tokens: mintToken._id } },
        { new: true }
      );

      return res.status(200).json({
        success: true,
        message: "Token minted successfully",
        mintToken,
      });
    }
    res.status(400).json({
      success: false,
      message: "Failed to mint token",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message ? error.message : error,
    });
  }
};

// Controller to get all collections owned by a user
export const getUserCollections = async (req, res) => {
  const userId = req.user.id;
  try {
    const collections = await CollectionModel.find({ collectionOwner: userId });
    if (collections.length <= 0) {
      return res.status(200).json({
        success: true,
        message: "No collections created for this user",
      });
    }
    res.status(200).json({
      success: true,
      collections,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

// controller to get all tokens owned by a user
export const getUserToken = async (req, res) => {
  const userId = req.user.id;

  try {
    // Get the user data
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    const userAddress = user.accountAddress;

    // Retrieve standard tokens owned by the user
    const tokens = await TokenModel.find({
      tokenOwnerAddress: userAddress,
      isItem: { $ne: true }, // Ensure standard tokens are not items
    });

    // special tokens owned by the user
    const specialTokens = await SpecialTokenModel.find({
      tokenOwnerId: userId,
    });

    // item tokens owned by the user
    const itemTokens = await TokenModel.find({
      tokenOwnerAddress: userAddress,
      isItem: true,
    });

    const allTokens = {
      standardTokens: tokens || [],
      specialTokens: specialTokens || [],
      itemTokens: itemTokens || [],
    };

    // Check if no tokens exist for the user
    if (!tokens.length && !specialTokens.length) {
      return res.status(200).json({
        success: true,
        message: "No tokens created for this user",
        allTokens,
      });
    }

    // Return all tokens (standard and special) in the response
    res.status(200).json({
      success: true,
      message: "Tokens retrieved successfully",
      allTokens,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const getUserTokensAndPrizes = async (req, res) => {
  const userId = req.user.id;
  try {
    const user = await UserModel.findById(userId)
      .populate("collectedTokens")
      .populate({ path: "wonPrizes", strictPopulate: false });
    // .populate("wonPrizes");
    res.status(200).json({
      success: true,
      collectedTokens: user.collectedTokens,
      wonPrizes: user.wonPrizes,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
};

export const createSpecialToken = async (req, res) => {
  const {
    collectionId,
    tokenName,
    tokenDescription,
    tokenImageUrl,
    priceOfCoupon,
    category,
  } = req.body;
  const userId = req.user.id;
  try {
    const user = await UserModel.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found",
      });
    }

    //Get mnemonic from logged in user
    const mnemonic = user.mnemonic;
    if (!mnemonic) {
      return res.status(400).json({
        success: false,
        message: "User mnemonic not found",
      });
    }

    const account = await KeyringProvider.fromMnemonic(mnemonic);
    const address = account.address;

    
    const sdk = new Sdk({
      baseUrl: "https://rest.unique.network/opal/v1",
      signer: account,
    });

    const result = await sdk.token.create.submitWaitResult({
      address,
      collectionId,
      data: {
        image: {
          ipfsCid: tokenImageUrl,
        },
        name: {
          _: tokenName,
        },
        description: {
          _: tokenDescription,
        },
      },
    });

    const tokenId = result.parsed?.tokenId;
    console.log(`This is the special tokenId: ${tokenId}`);
    const mintTokenCompleted = result.isCompleted;
    console.log(`Special token minting completed: ${mintTokenCompleted}`);

    if (mintTokenCompleted) {
      // const unqPrice = usdToUnq(priceOfCoupon);

      const specialToken = await SpecialTokenModel.create({
        collectionId,
        tokenId,
        tokenName,
        tokenDescription,
        tokenImageUrl,
        category,
        tokenOwnerAddress: address,
        tokenOwnerId: user._id,
        tokenUrl: `https://uniquescan.io/opal/tokens/${collectionId}/${tokenId}`,
        priceOfCoupon: Number(priceOfCoupon).toFixed(2),
        metadata: {
          storeAddress: user.accountAddress,
          storeId: user._id,
        },
      });

      return res.status(200).json({
        success: true,
        message: "Special token created successfully",
        specialToken,
      });
    }

    res.status(400).json({
      success: false,
      message: "Failed to mint special token",
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message ? error.message : error,
    });
  }
};

export const getItemsByCategory = async (req, res) => {
  const { category } = req.params;

  try {
    const tokens = await TokenModel.find({
      category,
      isItem: true,
      isPurchased: false,
    });

    if (!tokens.length) {
      return res.status(200).json({
        success: true,
        message: `No items found for category: ${category}`,
        tokens: [],
      });
    }

    res.status(200).json({
      success: true,
      tokens,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message ? error.message : error,
    });
  }
};
