// The 400 answer for invalid input, used by validate() and by controllers with their own checks.
export function invalidInput(res, issues) {
  return res.status(400).json({
    status: "fail",
    message: "Invalid input",
    errors: issues.map((issue) => ({
      field: issue.path.join("."),
      message: issue.message,
    })),
  });
}

export default function validate(schema) {
  return (req, res, next) => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      return invalidInput(res, result.error.issues);
    }

    req.body = result.data;
    next();
  };
}
