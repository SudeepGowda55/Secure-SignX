import { run } from "@xmtp/message-kit";
import dotenv from "dotenv";
dotenv.config();

const managerAddress = process.env.MANAGER_ADDRESS;
const complianceOfficerAddress = process.env.COMPLIANCE_OFFICER_ADDRESS;

const API_BASE_URL = process.env.API_BASE_URL_PROD;

async function apiRequest(endpoint, method = "GET", body = null) {
  const options = {
    method,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.API_KEY}`,
    },
  };

  if (body) {
    options.body = JSON.stringify(body);
  }

  try {
    const response = await fetch(`${API_BASE_URL}${endpoint}`, options);

    const contentType = response.headers.get("content-type");
    if (!contentType || !contentType.includes("application/json")) {
      const text = await response.text();
      console.error("Non-JSON response:", text);
      throw new Error(`Expected JSON but received: ${contentType}`);
    }

    const data = await response.json();

    if (!response.ok) {
      console.error("API error:", data);
      throw new Error(data.message || `API request failed with status ${response.status}`);
    }

    return data;
  } catch (error) {
    console.error("API request failed:", error);
    throw error;
  }
}

async function aiApiRequest(prompt, senderAddress, documentHash = null) {
  try {
    const response = await apiRequest("/ai/query", "POST", {
      prompt,
      senderAddress,
      documentHash,
    });

    if (!response.success) {
      throw new Error(response.error || "AI query failed");
    }

    return response.response;
  } catch (error) {
    console.error("AI query failed:", error);
    throw error;
  }
}

function extractDocumentHash(text) {
  const hashRegex = /(0x)?[0-9a-fA-F]{64}/;
  const match = text.match(hashRegex);
  return match ? match[0] : null;
}

async function cacheDocumentForAI(documentData) {
  try {
    await apiRequest("/ai/cache-document", "POST", { documentData });
  } catch (error) {
    console.error("Failed to cache document for AI:", error);
  }
}

async function sendCustomerGreeting(context) {
  const greetingMessage =
    `👋 Welcome to ComplianceBot! 👋\n\n` +
    `📄 I help manage document compliance processes.\n\n` +
    `COMMANDS:\n` +
    `🔍 Check status: "status <document-hash>"\n` +
    `📤 Submit documents for review\n` +
    `❓ Ask AI: "ask <your question>"\n` +
    `   Example: "ask what documents I need for KYC compliance"\n\n` +
    `Need help? Type "help"`;
  await context.sendTo(greetingMessage, [context.message.sender.address]);
}

async function sendOfficerGreeting(context) {
  const greetingMessage =
    `👮 Welcome Compliance Officer! 👮\n\n` +
    `I assist with document review and compliance approval.\n\n` +
    `COMMANDS:\n` +
    `✅ Approve: "approve <document-hash>"\n` +
    `❌ Reject: "reject <document-hash> <reason>"\n` +
    `📋 Pending: "list pending"\n` +
    `❓ Ask AI: "ask <your question>"\n` +
    `   Example: "ask about compliance requirements for AML"\n\n` +
    `Type "help" for assistance`;
  await context.sendTo(greetingMessage, [context.message.sender.address]);
}

async function sendManagerGreeting(context) {
  const message =
    `👔 Welcome Manager! 👔\n\n` +
    `Access compliance reports and oversight tools.\n\n` +
    `COMMANDS:\n` +
    `📊 Reports: "view reports"\n` +
    `❓ Ask AI: "ask <your question>"\n` +
    `   Example: "ask for compliance metrics summary"\n\n` +
    `Type "help" for assistance`;
  await context.sendTo(message, [context.message.sender.address]);
}

async function queryDocumentStatus(context, documentHash) {
  try {
    const { document } = await apiRequest(`/documents/${documentHash}`);

    if (!document) {
      await context.sendTo(
        `❌ Document Not Found\n\n` +
          `No document found with hash: ${documentHash}\n` +
          `Please verify the hash and try again.`,
        [context.message.sender.address]
      );
      return;
    }

    const statusEmoji = {
      approved: "✅",
      rejected: "❌",
      pending_approval: "⏳",
    };

    let statusMessage =
      `📄 DOCUMENT STATUS\n` +
      `────────────────\n` +
      `📛 Name: ${document.document_name}\n` +
      `🔗 Hash: ${document.document_hash}\n` +
      `${
        statusEmoji[document.compliance_status] || "📊"
      } Status: ${document.compliance_status.toUpperCase()}\n\n` +
      `🔍 View: https://ipfs.infura.io/ipfs/${document.ipfs_cid}\n`;

    if (document.compliance_status === "rejected" && document.rejection_reason) {
      statusMessage += `\n❗ Rejection Reason: ${document.rejection_reason}\n`;
    }

    if (document.attestationId) {
      statusMessage +=
        `\n⛓️ Blockchain Attestation:\n` +
        `   - Sign Protocol: https://testnet-scan.sign.global/attestation/onchain_evm_534351_${document.attestationId}\n` +
        `   - Scrollscan: https://sepolia.scrollscan.com/tx/${document.txHash}\n`;
    }

    await context.sendTo(statusMessage, [context.message.sender.address]);
  } catch (error) {
    await context.sendTo(
      `⚠️ Error Fetching Status\n\n` +
        `Could not retrieve document status:\n` +
        `${error.message}\n\n` +
        `Please try again later.`,
      [context.message.sender.address]
    );
  }
}

async function recordOnChain(documentData) {
  try {
    const response = await apiRequest("/record", "POST", {
      documentName: documentData.document_name,
      documentHash: documentData.document_hash,
      ipfsCID: documentData.ipfs_cid,
      attestor: documentData.attestor,
      submitter: documentData.submitter,
      complianceStatus: documentData.compliance_status,
    });

    return response;
  } catch (error) {
    console.error("Error recording on chain:", error);
    return { success: false, error: error.message };
  }
}

function parseDocumentMessage(text) {
  const lines = text.split("\n").filter((line) => line.trim() !== "");

  const result = {};
  lines.forEach((line) => {
    if (line.includes(":")) {
      const [key, value] = line.split(":").map((part) => part.trim());
      const normalizedKey = key.toLowerCase().replace(" ", "_");
      result[normalizedKey] = value;
    }
  });

  return {
    document_name: result.name || "",
    document_hash: result.hash || "",
    ipfs_cid: result.ipfs_cid || "",
    attestor: result.attestor || "",
    submitter: result.submitter || "",
    compliance_status: "pending_approval",
    rejection_reason: "",
  };
}

async function listPendingDocuments(context) {
  try {
    const { documents } = await apiRequest("/documents?status=pending_approval");

    if (!documents || documents.length === 0) {
      return "📭 No pending documents for review.";
    }

    let response = `📋 PENDING DOCUMENTS (${documents.length})\n` + `─────────────────────────\n`;

    documents.forEach((doc, index) => {
      response +=
        `${index + 1}. ${doc.document_name}\n` +
        `   🔗 ${doc.document_hash}\n` +
        `   👤 ${doc.submitter}\n` +
        `   🔍 https://ipfs.infura.io/ipfs/${doc.ipfs_cid}\n\n`;
    });

    response += `\nTO APPROVE/REJECT:\n` + `✅ approve <hash>\n` + `❌ reject <hash> <reason>`;

    return response;
  } catch (error) {
    console.error("Error listing pending documents:", error);
    return `⚠️ Service Unavailable\n\nCould not retrieve pending documents.\nPlease try again later.`;
  }
}

async function generateReports(context) {
  try {
    const { documents } = await apiRequest("/reports");

    if (!documents || documents.length === 0) {
      await context.sendTo(`📊 COMPLIANCE REPORT\n\n` + `No documents have been submitted yet.`, [
        context.message.sender.address,
      ]);
      return;
    }

    const groupedDocs = {
      approved: [],
      rejected: [],
      pending: [],
    };

    documents.forEach((doc) => {
      if (doc.compliance_status === "approved") {
        groupedDocs.approved.push(doc);
      } else if (doc.compliance_status === "rejected") {
        groupedDocs.rejected.push(doc);
      } else {
        groupedDocs.pending.push(doc);
      }
    });

    let reportMessage =
      `📊 COMPLIANCE REPORT 📊\n\n` +
      `📋 Total Documents: ${documents.length}\n` +
      `✅ Approved: ${groupedDocs.approved.length}\n` +
      `❌ Rejected: ${groupedDocs.rejected.length}\n` +
      `⏳ Pending: ${groupedDocs.pending.length}\n\n`;

    // Approved Documents
    if (groupedDocs.approved.length > 0) {
      reportMessage += "✅ APPROVED DOCUMENTS ✅\n";
      reportMessage += "─────────────────────────\n";
      groupedDocs.approved.forEach((doc, index) => {
        reportMessage +=
          `${index + 1}. ${doc.document_name}\n` +
          `   🔗 ${doc.document_hash}\n` +
          `   👤 ${doc.submitter}\n` +
          `   📅 ${doc.updated_at || "N/A"}\n` +
          `   🔍 https://ipfs.infura.io/ipfs/${doc.ipfs_cid}\n`;
        if (doc.attestationId) {
          reportMessage +=
            `   ⛓️ Blockchain Proof:\n` +
            `      - Sign Protocol: https://testnet-scan.sign.global/attestation/onchain_evm_534351_${doc.attestationId}\n` +
            `      - Scrollscan: https://sepolia.scrollscan.com/tx/${doc.txHash}\n`;
        }
        reportMessage += "\n";
      });
    }

    // Rejected Documents
    if (groupedDocs.rejected.length > 0) {
      reportMessage += "❌ REJECTED DOCUMENTS ❌\n";
      reportMessage += "─────────────────────────\n";
      groupedDocs.rejected.forEach((doc, index) => {
        reportMessage +=
          `${index + 1}. ${doc.document_name}\n` +
          `   🔗 ${doc.document_hash}\n` +
          `   👤 ${doc.submitter}\n` +
          `   📅 ${doc.updated_at || "N/A"}\n` +
          `   ❗ ${doc.rejection_reason || "No reason provided"}\n` +
          `   🔍 https://ipfs.infura.io/ipfs/${doc.ipfs_cid}\n`;
        if (doc.attestationId) {
          reportMessage +=
            `   ⛓️ Blockchain Proof:\n` +
            `      - Sign Protocol: https://testnet-scan.sign.global/attestation/onchain_evm_534351_${doc.attestationId}\n` +
            `      - Scrollscan: https://sepolia.scrollscan.com/tx/${doc.txHash}\n`;
        }
        reportMessage += "\n";
      });
    }

    // Pending Documents
    if (groupedDocs.pending.length > 0) {
      reportMessage += "⏳ PENDING DOCUMENTS ⏳\n";
      reportMessage += "─────────────────────────\n";
      groupedDocs.pending.forEach((doc, index) => {
        reportMessage +=
          `${index + 1}. ${doc.document_name}\n` +
          `   🔗 ${doc.document_hash}\n` +
          `   👤 ${doc.submitter}\n` +
          `   📅 ${doc.created_at || "N/A"}\n` +
          `   🔍 https://ipfs.infura.io/ipfs/${doc.ipfs_cid}\n\n`;
      });
    }

    // Summary
    reportMessage +=
      `📌 SUMMARY\n` +
      `──────────\n` +
      `• Total Documents: ${documents.length}\n` +
      `• Compliance Rate: ${Math.round(
        (groupedDocs.approved.length / documents.length) * 100
      )}%\n` +
      `• Rejection Rate: ${Math.round((groupedDocs.rejected.length / documents.length) * 100)}%\n` +
      `• Pending Approval: ${groupedDocs.pending.length}`;

    await context.sendTo(reportMessage, [context.message.sender.address]);
  } catch (error) {
    console.error("Error generating reports:", error);
    await context.sendTo(
      `⚠️ Report Generation Failed\n\n` +
        `Could not generate compliance report:\n` +
        `${error.message}\n\n` +
        `Please try again later.`,
      [context.message.sender.address]
    );
  }
}

async function documentSubmissionSuccess(context, documentData) {
  await context.sendTo(
    `📤 NEW DOCUMENT SUBMISSION\n` +
      `─────────────────────────\n` +
      `📛 ${documentData.document_name}\n` +
      `🔗 ${documentData.document_hash}\n` +
      `👤 ${documentData.submitter}\n\n` +
      `🔍 https://ipfs.infura.io/ipfs/${documentData.ipfs_cid}\n\n` +
      `TO APPROVE/REJECT:\n` +
      `✅ approve ${documentData.document_hash}\n` +
      `❌ reject ${documentData.document_hash} <reason>`,
    [complianceOfficerAddress]
  );

  await context.send(
    `📬 Submission Received\n\n` +
      `Your document "${documentData.document_name}" is under review.\n` +
      `You'll be notified once processed.\n\n` +
      `Track status with:\n` +
      `status ${documentData.document_hash}`
  );
}

async function documentApprovalResponse(context, documentData, newStatus) {
  const statusMessages = {
    approved:
      `✅ APPROVAL CONFIRMED\n\n` +
      `Document: ${documentData.document_name}\n` +
      `Status: APPROVED\n\n` +
      `Blockchain verified and recorded.`,
    rejected:
      `❌ REJECTION NOTICE\n\n` +
      `Document: ${documentData.document_name}\n` +
      `Status: REJECTED\n` +
      `Reason: ${documentData.rejection_reason}\n\n` +
      `Please address issues and resubmit.`,
  };

  const blockchainMessage =
    `\n⛓️ Blockchain Record:\n` +
    `- Sign Protocol: https://testnet-scan.sign.global/attestation/onchain_evm_534351_${documentData.attestationId}\n` +
    `- Scrollscan: https://sepolia.scrollscan.com/tx/${documentData.txHash}`;

  // Notify submitter
  await context.sendTo(statusMessages[newStatus] + blockchainMessage, [documentData.submitter]);

  // Notify manager
  await context.sendTo(
    `📄 DOCUMENT ${newStatus.toUpperCase()}\n` +
      `─────────────────────────\n` +
      `📛 ${documentData.document_name}\n` +
      `🔗 ${documentData.document_hash}\n` +
      `👤 Submitter: ${documentData.submitter}\n` +
      `👮 Officer: ${documentData.attestor}\n` +
      `${newStatus === "rejected" ? `❗ Reason: ${documentData.rejection_reason}\n` : ""}` +
      `🔍 https://ipfs.infura.io/ipfs/${documentData.ipfs_cid}\n\n` +
      blockchainMessage,
    [managerAddress]
  );

  // Confirm to officer
  await context.sendTo(
    `✔️ Action Completed\n\n` +
      `Document "${documentData.document_name}" has been ${newStatus}.\n` +
      `All parties have been notified.` +
      blockchainMessage,
    [context.message.sender.address]
  );
}

async function handleInvalidCommand(context, senderAddress) {
  const responses = {
    [complianceOfficerAddress]:
      `⚠️ Invalid Command\n\n` +
      `OFFICER COMMANDS:\n` +
      `✅ approve <document-hash>\n` +
      `❌ reject <document-hash> <reason>\n` +
      `📋 list pending\n` +
      `❓ ask <question>\n\n` +
      `Type "help" for assistance`,
    [managerAddress]:
      `⚠️ Invalid Command\n\n` +
      `MANAGER COMMANDS:\n` +
      `📊 view reports\n` +
      `❓ ask <question>\n\n` +
      `Type "help" for assistance`,
    default:
      `⚠️ Invalid Command\n\n` +
      `Available commands:\n` +
      `🔍 status <document-hash>\n` +
      `📤 Submit documents for review\n` +
      `❓ ask <question>\n\n` +
      `Type "help" for assistance`,
  };

  const message = responses[senderAddress] || responses.default;
  await context.sendTo(message, [senderAddress]);
}

run(async (context) => {
  const { content, sender } = context.message;
  const text = content.content;
  const senderAddress = sender.address;

  if (text.toLowerCase() === "help" || text === "") {
    if (senderAddress === complianceOfficerAddress) {
      await sendOfficerGreeting(context);
    } else if (senderAddress === managerAddress) {
      await sendManagerGreeting(context);
    } else {
      await sendCustomerGreeting(context);
    }
    return;
  }

  // Handle AI queries
  if (text.toLowerCase().startsWith("ask")) {
    const question = text.substring(3).trim();
    const documentData = parseDocumentMessage(text);
    const documentHash = documentData.document_hash;

    if (!question) {
      await context.sendTo(
        "Please provide a question after 'ask'. Example: 'ask what documents need for compliance'",
        [senderAddress]
      );
      return;
    }

    try {
      const aiResponse = await aiApiRequest(question, senderAddress, documentHash);
      await context.sendTo(aiResponse, [senderAddress]);
    } catch (error) {
      console.error("AI query error:", error);
      await context.sendTo(
        "⚠️ AI Service Unavailable\n\n" +
          "Could not process your question at this time.\n" +
          "Please try again later.",
        [senderAddress]
      );
    }
    return;
  }

  if (text.includes("Document Submission:")) {
    try {
      const documentData = parseDocumentMessage(text);

      if (!documentData.document_hash || !documentData.ipfs_cid) {
        await context.send(
          `❌ Submission Error\n\n` +
            `Document hash and IPFS CID are required fields.\n` +
            `Please include all required information.`
        );
        return;
      }

      // Cache document for AI context
      await cacheDocumentForAI(documentData);

      const { success, error } = await apiRequest("/documents", "POST", documentData);

      if (success) {
        await documentSubmissionSuccess(context, documentData);
      } else {
        await context.send(
          `❌ Submission Failed\n\n` +
            `Could not process your document:\n` +
            `${error || "Unknown error"}\n\n` +
            `Please try again.`
        );
      }
    } catch (error) {
      await context.send(
        `⚠️ System Error\n\n` +
          `Could not submit document:\n` +
          `${error.message}\n\n` +
          `Please try again later.`
      );
    }
    return;
  } else if (text.toLowerCase().includes("approve") || text.toLowerCase().includes("reject")) {
    const parts = text.split(" ");
    const command = parts[0].toLowerCase();
    const documentHash = parts[1];

    if (senderAddress === complianceOfficerAddress) {
      try {
        const { document: documentData } = await apiRequest(`/documents/${documentHash}`);

        if (!documentData) {
          await context.send(
            `❌ Document Not Found\n\n` + `No pending document found with hash: ${documentHash}`
          );
          return;
        }

        if (documentData.compliance_status !== "pending_approval") {
          await context.send(
            `⚠️ Document Already Processed\n\n` +
              `"${documentData.document_name}" has already been ${documentData.compliance_status}.`
          );
          return;
        }

        const newStatus = command === "approve" ? "approved" : "rejected";
        const updatedDoc = {
          ...documentData,
          compliance_status: newStatus,
          attestor: senderAddress,
        };

        if (newStatus === "rejected") {
          const rejectionReason = text.split(" ").slice(2).join(" ");
          if (!rejectionReason) {
            await context.send(
              `❌ Missing Reason\n\n` +
                `Please provide a rejection reason:\n` +
                `reject <hash> <reason>`
            );
            return;
          }
          updatedDoc.rejection_reason = rejectionReason;
        }

        const onChainResponse = await recordOnChain(updatedDoc);

        if (onChainResponse.success) {
          const finalDoc = {
            ...updatedDoc,
            attestationId: onChainResponse.response.attestationId,
            txHash: onChainResponse.response.txHash,
            indexingValue: onChainResponse.response.indexingValue,
          };

          await apiRequest(`/documents/${documentHash}`, "PUT", finalDoc);
          await documentApprovalResponse(context, finalDoc, newStatus);
        } else {
          await context.sendTo(
            `⚠️ Blockchain Error\n\n` +
              `Document marked as ${newStatus} but blockchain recording failed:\n` +
              `${onChainResponse.error}`,
            [senderAddress]
          );
        }
      } catch (error) {
        console.error("Error processing document review:", error);
        await context.send(
          `⚠️ Processing Error\n\n` +
            `Could not complete your request:\n` +
            `${error.message}\n\n` +
            `Please try again later.`
        );
      }
    } else {
      await context.send(
        `⛔ Unauthorized\n\n` + `Only compliance officers can approve/reject documents.`
      );
    }
  } else if (text.toLowerCase() === "list pending") {
    if (senderAddress === complianceOfficerAddress) {
      const pendingList = await listPendingDocuments(context);
      await context.sendTo(pendingList, [senderAddress]);
    } else {
      await context.send(
        `⛔ Unauthorized\n\n` + `Only compliance officers can view pending documents.`
      );
    }
  } else if (text.toLowerCase() === "view reports") {
    if (senderAddress === managerAddress) {
      await generateReports(context);
    } else {
      await context.sendTo(`⛔ Unauthorized\n\n` + `Only managers can view compliance reports.`, [
        senderAddress,
      ]);
    }
  } else if (text.toLowerCase().startsWith("status ")) {
    const parts = text.split(" ");
    const documentHash = parts[1];
    await queryDocumentStatus(context, documentHash);
  } else {
    // try {
    //   const aiResponse = await aiApiRequest(
    //     `The user sent: "${text}". They might need help or have a question.`,
    //     senderAddress
    //   );
    //   await context.sendTo(aiResponse, [senderAddress]);
    // } catch (error) {
    await handleInvalidCommand(context, senderAddress);
    // }
  }
});

import express from "express";

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.send("Bot running!");
});

app.listen(port, () => {
  console.log(`Bot listening on port ${port}`);
});
