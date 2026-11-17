import multer from "multer";

// Same limit as the AI service (VAL-016)
export const MAX_AUDIO_BYTES = 5 * 1024 * 1024;

// The audio stays in memory: it is only sent to the AI service, never written to disk or stored
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_AUDIO_BYTES, files: 1, fields: 10 },
}).single("audio");

// Reads one "audio" file plus the text fields of a multipart form into req.file and req.body
export default function audioUpload(req, res, next) {
  upload(req, res, (error) => {
    if (!error) return next();

    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ status: "fail", message: "The audio file is too large" });
    }
    return res.status(400).json({ status: "fail", message: "Invalid audio upload" });
  });
}
