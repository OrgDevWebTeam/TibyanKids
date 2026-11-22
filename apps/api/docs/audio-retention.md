# Audio Recordings: Purpose, Retention and Deletion (SEC-006)

Date: 2026-11-22
Status: proposed. It describes what the code does today and states the retention class that follows from it. The PM and the AI team need to confirm it.

SEC-006: "Audio recitations shall have an explicit purpose, a retention class and a deletion pathway."

## Purpose

A child's recording of one ayah is analysed to give the child preliminary feedback on their recitation (FR-QUR-003 and FR-QUR-004). The recording is used for that analysis and for nothing else. It is not used to train a model, to profile the child, or for advertising (SEC-009).

## What happens to a recording

| Step                                  | Where                             | What happens                                                                                                             |
| ------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| 1. The parent's app uploads it        | API (`audioUpload.js`)            | Allowed only for an active child with active consent. At most 5 MB, one file. Held **in memory**, never written to disk. |
| 2. The API sends it to the AI service | API to AI service (`aiClient.js`) | Sent with an attempt id, the surah, the ayah and the level. No name, date of birth, child id or family id.               |
| 3. The AI service decodes it          | AI service (`app/audio.py`)       | Written to a **temporary folder** so that `ffmpeg` can read it. The folder is removed as soon as decoding ends.          |
| 4. The AI service analyses it         | AI service (`app/pipeline.py`)    | Held in memory. The log entry has the attempt id, surah, ayah, level and timings only. It never has audio or a child id. |
| 5. The API keeps the result           | API (`QuranAttempt`)              | Only the result is saved: findings, model name and version, decision, quality and timing. **There is no audio field.**   |

## Retention class

**Not retained.** No recording is stored anywhere that outlives the request. It exists in the API's memory and the AI service's memory for the length of the request, and in a temporary file in the AI service for the length of decoding.

## Deletion pathway

- **Recordings:** there is nothing to delete, because none is stored. A request to delete a child's data (SEC-015) does not need to look for audio.
- **Results:** the saved `QuranAttempt` results belong to the child's learning record. They are deleted with the child's data through the deletion workflow (SEC-015), which is not built yet.

## What must stay true

These are the conditions that make "not retained" correct. A change to any of them needs this document to be updated first.

1. The API keeps using memory storage for uploads, and `QuranAttempt` gets no audio field.
2. The AI service removes the temporary file when decoding ends, including when decoding fails or times out. Its temporary folder should be on the container's own temporary storage, which disappears with the container.
3. No log, error report or analytics event contains audio, and none contains a child or family id next to an attempt.
4. The AI service is reachable only from the API (see finding S-13 in `security-review.md`).

## This will have to change for teacher review

The CRS asks for a teacher to be able to review a child's audio (FR-QUR-006), and for a recitation to be flagged for that review (FR-QUR-005). That cannot work without stored audio, so "not retained" is correct for the prototype only. Before any code stores a recording, this document has to define the new retention class (how long, and why), the storage (private, encrypted, not publicly readable), who can listen (only an assigned teacher and the child's parent), and how a recording is deleted on request (SEC-015).

## Open decisions

- Does the PM accept "not retained" as the class for the prototype, knowing that FR-QUR-005 and FR-QUR-006 will need stored audio later?
- Does the AI team confirm that the AI service keeps no copy of a recording (for example in a cache, a crash dump or a request log) beyond what is described above?
