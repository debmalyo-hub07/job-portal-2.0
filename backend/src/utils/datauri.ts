/**
 * Cloudinary accepts a standard data URI. Building it from the validated MIME
 * type avoids the vulnerable `datauri` package and ignores a user-controlled
 * filename extension.
 */
const getDataUri = (file: Express.Multer.File) => ({
  content: `data:${file.mimetype};base64,${file.buffer.toString("base64")}`,
});

export default getDataUri;
