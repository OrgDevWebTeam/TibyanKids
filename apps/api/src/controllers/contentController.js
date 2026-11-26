import mongoose from "mongoose";
import Competency from "../Models/Competency.js";
import Content from "../Models/Content.js";
import { eligibleForChild } from "../missions/contentLinking.js";
import AppError from "../utils/AppError.js";
import { recordAudit } from "../utils/audit.js";
import { findChildInFamily } from "../utils/findChildInFamily.js";
import { contentChildQuery, listContentQuery } from "../validations/contentValidation.js";

const CAN_SEE_ALL = ["content_admin", "platform_admin", "reviewer"];

async function assertCompetenciesUsable(ids) {
  const unique = [...new Set(ids)];
  const found = await Competency.countDocuments({
    _id: { $in: unique },
    active: true,
  });

  if (found !== unique.length) {
    throw new AppError(400, "One or more competencies do not exist or are inactive");
  }
}

// Runs the work in a transaction, so a change and its audit event are saved together or not at all.
async function inTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => {
      result = await work(session);
    });
    return result;
  } finally {
    await session.endSession();
  }
}

// Every version of a piece of content: the root itself and everything pointing to it
const lineageFilter = (rootId) => ({ $or: [{ rootId }, { _id: rootId }] });

// A parent can ask for what suits one of their children (API-006). Returns that child, or null when
// no childId was given. The child must be in the parent's family. Staff have no children, so the
// content team cannot use it (they have the ageBand filter).
async function childForRequest(req, childId) {
  if (childId === undefined) return null;
  if (req.user.role !== "parent") {
    throw new AppError(400, "childId can only be used by a parent");
  }
  return findChildInFamily(req, childId);
}

export async function listContent(req, res) {
  const { page, limit, status, childId, ...filters } = listContentQuery.parse(req.query);
  const child = await childForRequest(req, childId);

  const filter = { ...filters };

  if (CAN_SEE_ALL.includes(req.user.role)) {
    if (status) filter.status = status;
  } else {
    filter.status = "published";
  }

  if (child) {
    // Only the child's age band. Asking for another band as well leaves nothing to show.
    if (filter.ageBand && filter.ageBand !== child.ageBand) {
      return res.json({ status: "success", total: 0, page, pages: 0, items: [] });
    }
    filter.ageBand = child.ageBand;
  }

  const [items, total] = await Promise.all([
    Content.find(filter)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(limit),
    Content.countDocuments(filter),
  ]);

  res.json({
    status: "success",
    total,
    page,
    pages: Math.ceil(total / limit),
    items,
  });
}

export async function getContent(req, res) {
  const { childId } = contentChildQuery.parse(req.query);
  const child = await childForRequest(req, childId);
  const content = await Content.findById(req.params.id);

  const visible =
    content && (content.status === "published" || CAN_SEE_ALL.includes(req.user.role));

  // For a child, the same answer as content that does not exist
  if (!visible || (child && !eligibleForChild(content, child))) {
    throw new AppError(404, "Content not found");
  }

  res.json({ status: "success", content });
}

export async function createContent(req, res) {
  if (req.body.competencies) {
    await assertCompetenciesUsable(req.body.competencies);
  }

  const content = await inTransaction(async (session) => {
    const [created] = await Content.create([{ ...req.body, createdBy: req.user._id }], {
      session,
    });
    await recordAudit({
      actor: req.user,
      action: "content.created",
      target: { type: "Content", id: created._id },
      session,
    });
    return created;
  });

  res.status(201).json({ status: "success", content });
}

export async function updateContent(req, res) {
  if (req.body.competencies) {
    await assertCompetenciesUsable(req.body.competencies);
  }

  const content = await inTransaction(async (session) => {
    const found = await Content.findById(req.params.id).session(session);

    if (!found) {
      throw new AppError(404, "Content not found");
    }

    if (found.status !== "draft") {
      throw new AppError(409, "Only draft content can be updated");
    }

    found.set(req.body);
    await found.save({ session });

    // Only the names of the changed fields are logged, never their content
    await recordAudit({
      actor: req.user,
      action: "content.updated",
      target: { type: "Content", id: found._id },
      meta: { field: Object.keys(req.body).join(",").slice(0, 200) },
      session,
    });
    return found;
  });

  res.json({ status: "success", content });
}

// Published content is never edited. A new draft version is made from it instead (FR-CMS-001).
export async function createContentVersion(req, res) {
  const content = await inTransaction(async (session) => {
    const source = await Content.findById(req.params.id).session(session);

    if (!source) {
      throw new AppError(404, "Content not found");
    }

    if (source.status !== "published") {
      throw new AppError(409, "Only published content can get a new version");
    }

    const rootId = source.rootId ?? source._id;
    const open = await Content.exists({
      ...lineageFilter(rootId),
      status: { $in: ["draft", "in_review"] },
    }).session(session);

    if (open) {
      throw new AppError(409, "A newer version of this content is already in progress");
    }

    // The approval is not copied: review-required content must be approved again
    const [created] = await Content.create(
      [
        {
          title: source.title,
          type: source.type,
          description: source.description,
          ageBand: source.ageBand,
          language: source.language,
          domain: source.domain,
          level: source.level,
          estimatedMinutes: source.estimatedMinutes,
          competencies: source.competencies,
          reviewRequired: source.reviewRequired,
          status: "draft",
          version: source.version + 1,
          rootId,
          previousVersion: source._id,
          createdBy: req.user._id,
        },
      ],
      { session },
    );

    await recordAudit({
      actor: req.user,
      action: "content.version_created",
      target: { type: "Content", id: created._id },
      session,
    });
    return created;
  });

  res.status(201).json({ status: "success", content });
}

export async function listContentVersions(req, res) {
  const content = await Content.findById(req.params.id);

  if (!content) {
    throw new AppError(404, "Content not found");
  }

  const rootId = content.rootId ?? content._id;
  const versions = await Content.find(lineageFilter(rootId)).sort({ version: 1 });

  res.json({ status: "success", rootId, count: versions.length, versions });
}

export async function submitForReview(req, res) {
  const content = await Content.findById(req.params.id);

  if (!content) {
    throw new AppError(404, "Content not found");
  }

  if (content.status !== "draft") {
    throw new AppError(409, "Only draft content can be submitted for review");
  }

  content.status = "in_review";
  content.reviewRequired = true;
  await content.save();

  res.json({ status: "success", content });
}

export async function approveContent(req, res) {
  const content = await Content.findById(req.params.id);

  if (!content) {
    throw new AppError(404, "Content not found");
  }

  if (content.status !== "in_review") {
    throw new AppError(409, "Only content that is in review can be approved");
  }

  if (content.createdBy.equals(req.user._id)) {
    try {
      await recordAudit({
        actor: req.user,
        action: "access.denied",
        target: { type: "Content", id: content._id },
        result: "denied",
        meta: { reason: "Self-approval" },
      });
    } catch (error) {
      console.error("Failed to record audit event:", error.message);
    }

    throw new AppError(403, "You cannot approve content you created");
  }

  content.reviewedBy = req.user._id;
  content.approvedAt = new Date();
  await content.save();

  res.json({ status: "success", content });
}

export async function publishContent(req, res) {
  const session = await mongoose.startSession();
  let content;

  try {
    await session.withTransaction(async () => {
      content = await Content.findById(req.params.id).session(session);

      if (!content) {
        throw new AppError(404, "Content not found");
      }

      if (!["draft", "in_review"].includes(content.status)) {
        throw new AppError(409, "Only draft or in-review content can be published");
      }

      if (content.competencies.length === 0) {
        throw new AppError(409, "Content needs at least one competency before publishing");
      }

      if (content.reviewRequired && (!content.reviewedBy || !content.approvedAt)) {
        throw new AppError(409, "Content must be approved by a reviewer before publishing");
      }

      // Only one version is live: older published versions of the same content are archived
      const older = await Content.find({
        ...lineageFilter(content.rootId ?? content._id),
        _id: { $ne: content._id },
        status: "published",
      }).session(session);

      for (const previous of older) {
        previous.status = "archived";
        await previous.save({ session });
        await recordAudit({
          actor: req.user,
          action: "content.archived",
          target: { type: "Content", id: previous._id },
          session,
        });
      }

      content.status = "published";
      await content.save({ session });

      await recordAudit({
        actor: req.user,
        action: "content.published",
        target: { type: "Content", id: content._id },
        session,
      });
    });
  } finally {
    await session.endSession();
  }

  res.json({ status: "success", content });
}
