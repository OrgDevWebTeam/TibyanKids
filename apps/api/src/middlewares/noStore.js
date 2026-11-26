// API answers can hold family and child data (SEC-003), so no browser or proxy may keep a copy.
export default function noStore(req, res, next) {
  res.set("Cache-Control", "no-store");
  next();
}
