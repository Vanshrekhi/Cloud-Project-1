const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { z } = require('zod');
const Student = require('./models/Student');

const studentFields = {
  studentId: z.string().trim().min(1),
  name: z.string().trim().min(1),
  email: z.string().trim().email(),
  department: z.string().trim().min(1),
  semester: z.number().int().min(1).max(12),
  contact: z.string().trim().min(1)
};

function result(value) {
  return { content: [{ type: 'text', text: JSON.stringify(value) }] };
}

function errorMessage(error) {
  if (error && error.code === 11000) return 'Student ID or email already exists';
  if (error && error.name === 'ValidationError') {
    const firstError = Object.values(error.errors || {})[0];
    return firstError ? firstError.message : error.message;
  }
  return error && error.message ? error.message : 'An unexpected error occurred';
}

async function runTool(operation) {
  try {
    return result(await operation());
  } catch (error) {
    return { ...result({ error: errorMessage(error) }), isError: true };
  }
}

function registerTools(server) {
  server.registerTool('list_students', {
    description: 'List all students',
    inputSchema: {}
  }, () => runTool(() => Student.find().lean()));

  server.registerTool('search_students', {
    description: 'Search students by partial name or student ID (case-insensitive)',
    inputSchema: { query: z.string().trim().min(1) }
  }, ({ query }) => {
    const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(escapedQuery, 'i');
    return runTool(() => Student.find({ $or: [{ name: pattern }, { studentId: pattern }] }).lean());
  });

  server.registerTool('get_student', {
    description: 'Get a student by student ID',
    inputSchema: { studentId: z.string().trim().min(1) }
  }, ({ studentId }) => runTool(async () => {
    const student = await Student.findOne({ studentId }).lean();
    if (!student) throw Object.assign(new Error('Student not found'), { code: 'STUDENT_NOT_FOUND' });
    return student;
  }));

  server.registerTool('add_student', {
    description: 'Add a student',
    inputSchema: studentFields
  }, (student) => runTool(() => Student.create(student)));

  server.registerTool('update_student', {
    description: 'Update a student by student ID',
    inputSchema: {
      studentId: z.string().trim().min(1),
      name: studentFields.name.optional(),
      email: studentFields.email.optional(),
      department: studentFields.department.optional(),
      semester: studentFields.semester.optional(),
      contact: studentFields.contact.optional()
    }
  }, ({ studentId, ...updates }) => runTool(async () => {
    const student = await Student.findOneAndUpdate({ studentId }, updates, { new: true, runValidators: true });
    if (!student) throw Object.assign(new Error('Student not found'), { code: 'STUDENT_NOT_FOUND' });
    return student;
  }));

  server.registerTool('delete_student', {
    description: 'Delete a student by student ID',
    inputSchema: { studentId: z.string().trim().min(1) }
  }, ({ studentId }) => runTool(async () => {
    const student = await Student.findOneAndDelete({ studentId });
    if (!student) throw Object.assign(new Error('Student not found'), { code: 'STUDENT_NOT_FOUND' });
    return student;
  }));
}

function mcpHandler(req, res) {
  const server = new McpServer({ name: 'student-management', version: '1.0.0' });
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
  let closed = false;
  const close = async () => {
    if (closed) return;
    closed = true;
    await Promise.allSettled([transport.close(), server.close()]);
  };
  res.on('close', close);
  registerTools(server);
  server.connect(transport).then(() => transport.handleRequest(req, res, req.body)).catch(async (error) => {
    if (!res.headersSent) res.status(500).json({ error: 'MCP request failed' });
    await close();
  });
}

module.exports = mcpHandler;
