import express from "express";
import bodyParser from "body-parser";
import cors from "cors";
import { createClient } from "redis";
import { createDocumentAttestation } from "./attestation.js";
import { GoogleGenerativeAI } from "@google/generative-ai";
import { authenticateToken } from "./auth.js";
import dotenv from "dotenv";
dotenv.config();

const app = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(express.json());

const redisClient = createClient({
  url: process.env.REDIS_URL,
});

redisClient.on("error", (err) => console.log("Redis Client Error", err));
await redisClient.connect();
console.log("Connected to Redis");

const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY);

const storeDocument = async (key, document) => {
  return await redisClient.hSet(`documents:${key}`, document);
};

const getAllDocuments = async () => {
  const keys = await redisClient.keys("documents:*");
  const docs = [];
  for (const key of keys) {
    const doc = await redisClient.hGetAll(key);
    docs.push(doc);
  }
  return docs;
};

const getDocumentsByStatus = async (status) => {
  const allDocs = await getAllDocuments();
  return allDocs.filter((doc) => doc.compliance_status === status);
};

const cacheAIContext = async (key, data) => {
  return await redisClient.hSet(`ai_context:${key}`, data);
};

const getAIContext = async (key) => {
  return await redisClient.hGetAll(`ai_context:${key}`);
};

function determineUserRole(senderAddress) {
  const complianceOfficerAddress = process.env.COMPLIANCE_OFFICER_ADDRESS;
  const managerAddress = process.env.MANAGER_ADDRESS;

  if (senderAddress === complianceOfficerAddress) {
    return "compliance officer";
  } else if (senderAddress === managerAddress) {
    return "manager";
  }
  return "customer";
}

async function generateAIResponse(prompt, senderAddress, documentHash = null) {
  const model = genAI.getGenerativeModel({
    model: "models/gemini-2.0-flash-lite",
  });

  const role = determineUserRole(senderAddress);
  let documentContext = "";
  let analyticContext = "";

  if (documentHash) {
    const doc = await getDocument(documentHash);
    if (doc && doc.document_hash) {
      documentContext += `
        Document Context:
        Name: ${doc.document_name || "N/A"}
        Hash: ${doc.document_hash}
        Status: ${doc.compliance_status || "N/A"}
        IPFS: ${doc.ipfs_cid || "N/A"}
        ${doc.rejection_reason ? `Rejection Reason: ${doc.rejection_reason}` : ""}
      `;
    }
  }

  const promptLC = prompt.toLowerCase();
  const allDocs = await getAllDocuments();

  if (promptLC.includes("approval rate")) {
    const approved = allDocs.filter((d) => d.compliance_status === "approved");
    const total = allDocs.length;
    const percentage = total ? ((approved.length / total) * 100).toFixed(2) : 0;
    analyticContext += `Approval rate this month is ${percentage}%. ${approved.length} of ${total} documents were approved.\n\n`;
  }

  const match = promptLC.match(/documents from customer (0x[a-fA-F0-9]{40})/);
  if (match && match[1]) {
    const customerAddr = match[1].toLowerCase();
    const docsFromUser = allDocs.filter((doc) => doc.submitter?.toLowerCase() === customerAddr);

    if (docsFromUser.length > 0) {
      analyticContext += `Found ${docsFromUser.length} documents from customer ${customerAddr}:\n`;
      docsFromUser.forEach((doc, idx) => {
        analyticContext += `${idx + 1}. Name: ${doc.document_name}, Hash: ${
          doc.document_hash
        }, Status: ${doc.compliance_status}\n`;
      });
    } else {
      analyticContext += `No documents found from customer ${customerAddr}.\n`;
    }
  }

  const systemMessage = `
    You are a compliance assistant for a document attestation system. The user is a ${role}.
    ${documentContext}

    ${analyticContext}

    Your capabilities:
    - Answer questions about document status and compliance
    - Explain compliance requirements
    - Guide users through document submission process
    - Provide information about approved/rejected documents
    - Answer document-related statistics and filtering queries
    
    Be concise, professional, and focus on compliance aspects.
  `;

  try {
    const result = await model.generateContent({
      contents: [
        {
          role: "user",
          parts: [{ text: `${systemMessage}\n\nUser Question: ${prompt}` }],
        },
      ],
    });

    return (await result.response).text();
  } catch (error) {
    console.error("Gemini API error:", error);
    throw new Error("Failed to generate AI response. Please try again later.");
  }
}

async function getDocument(key) {
  try {
    const doc = await redisClient.hGetAll(`documents:${key}`);
    return Object.keys(doc).length > 0 ? doc : null;
  } catch (error) {
    console.error(`Error retrieving document ${key}:`, error);
    return null;
  }
}

app.get("/documents/user/:address", authenticateToken, async (req, res) => {
  try {
    const address = req.params.address.toLowerCase();
    const allDocs = await getAllDocuments();
    const userDocs = allDocs.filter((doc) => doc.submitter?.toLowerCase() === address);

    res.json({ success: true, documents: userDocs });
  } catch (error) {
    console.error("Error fetching documents by user:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/health", authenticateToken, async (req, res) => {
  try {
    await redisClient.ping();
    res.json({
      status: "healthy",
      redis: "connected",
      ai: "available",
    });
  } catch (error) {
    res.status(500).json({
      status: "unhealthy",
      redis: "disconnected",
      error: error.message,
    });
  }
});

// Routes
app.get("/", authenticateToken, async (req, res) => {
  res.json({ message: "Compliance Bot API is working!" });
});

app.post("/ai/query", authenticateToken, async (req, res) => {
  try {
    const { prompt, senderAddress, documentHash } = req.body;

    if (!prompt || !senderAddress) {
      return res.status(400).json({
        success: false,
        error: "Prompt and senderAddress are required",
      });
    }

    const aiResponse = await generateAIResponse(prompt, senderAddress, documentHash);
    res.json({ success: true, response: aiResponse });
  } catch (error) {
    console.error("AI query error:", error);
    res.status(500).json({
      success: false,
      error: error.message || "Failed to process AI request",
    });
  }
});

app.post("/ai/cache-document", authenticateToken, async (req, res) => {
  try {
    const documentData = req.body.documentData;

    if (!documentData || !documentData.document_hash) {
      return res.status(400).json({
        success: false,
        error: "Document data with hash is required",
      });
    }

    await cacheAIContext(documentData.document_hash, documentData);
    res.json({ success: true });
  } catch (error) {
    console.error("AI cache error:", error);
    res.status(500).json({
      success: false,
      error: error.message,
    });
  }
});

app.post("/documents", authenticateToken, async (req, res) => {
  try {
    const document = req.body;
    await storeDocument(document.document_hash, document);
    res.status(201).json({ success: true, documentHash: document.document_hash });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/documents/:hash", authenticateToken, async (req, res) => {
  try {
    const document = await getDocument(req.params.hash);
    if (document && document.document_hash) {
      res.json({ success: true, document });
    } else {
      res.status(404).json({ success: false, error: "Document not found" });
    }
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/documents", authenticateToken, async (req, res) => {
  try {
    const { status } = req.query;
    const documents = status ? await getDocumentsByStatus(status) : await getAllDocuments();
    res.json({ success: true, documents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.put("/documents/:hash", authenticateToken, async (req, res) => {
  try {
    const { hash } = req.params;
    const existingDoc = await getDocument(hash);

    if (!existingDoc || !existingDoc.document_hash) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }

    const updatedDoc = { ...existingDoc, ...req.body };
    await storeDocument(hash, updatedDoc);
    res.json({ success: true, document: updatedDoc });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/record", authenticateToken, async (req, res) => {
  try {
    const { documentName, documentHash, ipfsCID, attestor, submitter, complianceStatus } = req.body;

    const existingDoc = await getDocument(documentHash);
    if (!existingDoc || !existingDoc.document_hash) {
      return res.status(404).json({ success: false, error: "Document not found" });
    }

    const updatedDoc = {
      ...existingDoc,
      compliance_status: complianceStatus,
      attestor: attestor,
      updated_at: new Date().toISOString(),
    };

    const response = await createDocumentAttestation(
      updatedDoc.document_name,
      updatedDoc.document_hash,
      updatedDoc.ipfs_cid,
      updatedDoc.attestor,
      updatedDoc.submitter,
      updatedDoc.compliance_status
    );

    const finalDoc = {
      ...updatedDoc,
      attestationId: response.attestationId,
      txHash: response.txHash,
      indexingValue: response.indexingValue,
    };

    await storeDocument(documentHash, finalDoc);
    res.json({ success: true, response });
  } catch (error) {
    console.error("Error in /record endpoint:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.post("/flush", authenticateToken, async (req, res) => {
  try {
    await redisClient.flushAll();
    res.json({ success: true, message: "Redis cache flushed successfully." });
  } catch (error) {
    console.error("Error flushing Redis:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

app.get("/reports", authenticateToken, async (req, res) => {
  try {
    const documents = await getAllDocuments();
    res.json({ success: true, documents });
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

app.listen(port, () => {
  console.log(`Compliance Bot API (Redis) running at port ${port}`);
});

process.on("SIGINT", async () => {
  await redisClient.quit();
  process.exit();
});
