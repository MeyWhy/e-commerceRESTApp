// A minimal in-memory stand-in for the mysql2 pool used by db.js.
// Each test controls behavior via db.query.mockImplementationOnce / mockResolvedValueOnce.
module.exports = {
  query: jest.fn()
};
