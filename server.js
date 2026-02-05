require('dotenv').config();
const express = require('express');
const axios = require('axios');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
 const bcrypt = require('bcrypt');
const fs = require('fs');
const path = require('path');
const { PrismaClient } = require('@prisma/client');

const app = express();
const prisma = new PrismaClient();

// Middleware
app.use(helmet());
app.use(cors());
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Static files for uploads
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}
app.use('/uploads', express.static(uploadsDir));

// Test database connection
app.get('/api/test', async (req, res) => {
  try {
    await prisma.$connect();
    res.json({ message: 'Database connected successfully!' });
  } catch (error) {
    res.status(500).json({ error: 'Database connection failed', details: error.message });
  }
});

// Admin create user (student/teacher)
app.post('/api/admin/users', async (req, res) => {
  try {
    const body = req.body || {};
    const role = body?.role;
    const name = body?.name != null ? String(body.name).trim() : '';
    const email = body?.email != null ? String(body.email).trim().toLowerCase() : '';
    const password = body?.password != null ? String(body.password) : '';
    const phone = body?.phone != null ? String(body.phone).trim() : '';

    if (!role || (role !== 'STUDENT' && role !== 'TEACHER')) {
      return res.status(400).json({ error: 'role must be STUDENT or TEACHER' });
    }
    if (!name || !email || !password || !phone) {
      return res.status(400).json({ error: 'name, email, password and phone are required' });
    }

    const emailLooksValid = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
    if (!emailLooksValid) {
      return res.status(400).json({ error: 'Invalid email' });
    }

    const passwordHash = await bcrypt.hash(password, 10);

    const normalizeGender = (v) => {
      if (v == null) return null;
      const s = String(v).trim();
      if (!s) return null;
      const lower = s.toLowerCase();
      if (lower === 'male' || lower === 'm') return 'MALE';
      if (lower === 'female' || lower === 'f') return 'FEMALE';
      if (lower === 'other' || lower === 'o') return 'OTHER';
      return null;
    };

    const toInt = (v) => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      return Number.isFinite(n) ? n : null;
    };

    const created = await prisma.$transaction(async (tx) => {
      const existing = await tx.user.findUnique({ where: { email } });
      if (existing) {
        throw new Error('Email already exists');
      }

      const user = await tx.user.create({
        data: {
          name,
          email,
          passwordHash,
          role,
          phone,
          status: 'ACTIVE'
        }
      });

      if (role === 'STUDENT') {
        const student = body?.student || {};
        const classIdInt = toInt(student?.classId);
        if (!classIdInt) {
          throw new Error('classId is required for student');
        }
        const cls = await tx.class.findUnique({ where: { id: classIdInt } });
        if (!cls) {
          throw new Error('Invalid classId');
        }

        const admissionDate = student?.admissionDate ? new Date(String(student.admissionDate)) : null;
        const dateOfBirth = student?.dateOfBirth ? new Date(String(student.dateOfBirth)) : null;
        const rollNo = student?.rollNo != null && String(student.rollNo).trim() !== '' ? String(student.rollNo).trim() : null;
        const guardianName = student?.guardianName != null && String(student.guardianName).trim() !== '' ? String(student.guardianName).trim() : null;
        const gender = normalizeGender(student?.gender);

        try {
          await tx.student.create({
            data: {
              userId: user.id,
              classId: classIdInt,
              rollNo,
              guardianName,
              admissionDate,
              dateOfBirth,
              gender
            }
          });
        } catch (e) {
          const msg = String(e?.message || '');
          const isGenderCheck = msg.includes('violates check constraint') && (msg.includes('gender') || msg.includes('chk_students_gender'));
          if (isGenderCheck) {
            await tx.student.create({
              data: {
                userId: user.id,
                classId: classIdInt,
                rollNo,
                guardianName,
                admissionDate,
                dateOfBirth,
                gender: null
              }
            });
          } else {
            throw e;
          }
        }
      }

      if (role === 'TEACHER') {
        const teacher = body?.teacher || {};
        const department = teacher?.department != null && String(teacher.department).trim() !== '' ? String(teacher.department).trim() : null;
        await tx.teacher.create({
          data: {
            userId: user.id,
            department
          }
        });
      }

      return user;
    });

    res.json({ id: created.id, role: created.role, name: created.name, email: created.email, phone: created.phone });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create user', details: error.message });
  }
});

app.get("/", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "ExamSetu Backend is running"
  });
});

app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "healthy",
    time: new Date().toISOString()
  });
});

// Admin list students (optionally filter by classId)
app.get('/api/admin/students', async (req, res) => {
  try {
    const classIdInt = req.query?.classId != null && String(req.query.classId).trim() !== '' ? parseInt(String(req.query.classId), 10) : null;
    if (classIdInt != null && !Number.isFinite(classIdInt)) {
      return res.status(400).json({ error: 'Invalid classId' });
    }

    const students = await prisma.student.findMany({
      where: classIdInt ? { classId: classIdInt } : {},
      include: {
        user: { select: { id: true, name: true, email: true, phone: true } },
        class: { select: { id: true, className: true, section: true } }
      },
      orderBy: [{ createdAt: 'asc' }]
    });

    const userIds = students.map((s) => s.user?.id).filter((v) => typeof v === 'number');
    const photoLogs = userIds.length
      ? await prisma.activityLog.findMany({
          where: {
            userId: { in: userIds },
            module: 'PROFILE',
            action: 'SET_PROFILE_PHOTO'
          },
          orderBy: { createdAt: 'desc' }
        })
      : [];

    const photoByUserId = {};
    for (const l of photoLogs) {
      if (photoByUserId[l.userId]) continue;
      const photo = l?.metadata?.profilePhoto;
      if (photo && typeof photo === 'string') {
        photoByUserId[l.userId] = photo;
      }
    }

    res.json(
      students.map((s) => ({
        studentId: s.id,
        userId: s.user?.id || null,
        name: s.user?.name || null,
        rollNo: s.rollNo || null,
        classId: s.class?.id || null,
        className: s.class?.className || null,
        section: s.class?.section || null,
        profilePhoto: s.user?.id && photoByUserId[s.user.id] ? photoByUserId[s.user.id] : null
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch students', details: error.message });
  }
});

// Admin student details
app.get('/api/admin/students/:id', async (req, res) => {
  try {
    const idInt = req.params?.id != null ? parseInt(String(req.params.id), 10) : null;
    if (!idInt || !Number.isFinite(idInt)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const student = await prisma.student.findUnique({
      where: { id: idInt },
      include: {
        user: { select: { id: true, name: true, email: true, phone: true, role: true, status: true, createdAt: true } },
        class: { select: { id: true, className: true, section: true } }
      }
    });
    if (!student) {
      return res.status(404).json({ error: 'Student not found' });
    }

    const lastPhoto = await prisma.activityLog.findFirst({
      where: {
        userId: student.userId,
        module: 'PROFILE',
        action: 'SET_PROFILE_PHOTO'
      },
      orderBy: { createdAt: 'desc' }
    });

    const profilePhoto = lastPhoto?.metadata?.profilePhoto;

    res.json({
      student: {
        id: student.id,
        rollNo: student.rollNo || null,
        guardianName: student.guardianName || null,
        admissionDate: student.admissionDate || null,
        dateOfBirth: student.dateOfBirth || null,
        gender: student.gender || null,
        createdAt: student.createdAt
      },
      user: student.user,
      class: student.class,
      profilePhoto: typeof profilePhoto === 'string' ? profilePhoto : null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch student', details: error.message });
  }
});

// Classmates list for a student (same class, excludes current student)
app.get('/api/students/classmates', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can access classmates' });
    }

    const classmates = await prisma.student.findMany({
      where: {
        classId: user.student.classId,
        NOT: { id: user.student.id }
      },
      include: {
        user: {
          select: {
            id: true,
            name: true
          }
        }
      },
      orderBy: [{ createdAt: 'asc' }]
    });

    const classmateUserIds = classmates.map((s) => s.user?.id).filter((v) => typeof v === 'number');
    const photoLogs = classmateUserIds.length
      ? await prisma.activityLog.findMany({
          where: {
            userId: { in: classmateUserIds },
            module: 'PROFILE',
            action: 'SET_PROFILE_PHOTO'
          },
          orderBy: { createdAt: 'desc' }
        })
      : [];

    const photoByUserId = {};
    for (const l of photoLogs) {
      if (photoByUserId[l.userId]) continue;
      const photo = l?.metadata?.profilePhoto;
      if (photo && typeof photo === 'string') {
        photoByUserId[l.userId] = photo;
      }
    }

    res.json(
      classmates.map((s) => ({
        studentId: s.id,
        userId: s.user?.id || null,
        name: s.user?.name || null,
        rollNo: s.rollNo || null,
        profilePhoto: s.user?.id && photoByUserId[s.user.id] ? photoByUserId[s.user.id] : null
      }))
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch classmates', details: error.message });
  }
});

// Persist profile photo illustration selection
app.get('/api/users/profile-photo', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const last = await prisma.activityLog.findFirst({
      where: {
        userId,
        module: 'PROFILE',
        action: 'SET_PROFILE_PHOTO'
      },
      orderBy: { createdAt: 'desc' }
    });

    const profilePhoto = last?.metadata?.profilePhoto;
    res.json({ userId, profilePhoto: typeof profilePhoto === 'string' ? profilePhoto : null });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch profile photo', details: error.message });
  }
});

app.post('/api/users/profile-photo', async (req, res) => {
  try {
    const { userId, profilePhoto } = req.body || {};
    const userIdInt = userId != null && userId !== '' ? parseInt(String(userId), 10) : null;
    const profilePhotoStr = profilePhoto != null && String(profilePhoto).trim() !== '' ? String(profilePhoto).trim() : null;

    if (!userIdInt || !profilePhotoStr) {
      return res.status(400).json({ error: 'userId and profilePhoto are required' });
    }

    await prisma.activityLog.create({
      data: {
        userId: userIdInt,
        module: 'PROFILE',
        action: 'SET_PROFILE_PHOTO',
        metadata: { profilePhoto: profilePhotoStr }
      }
    });

    res.json({ userId: userIdInt, profilePhoto: profilePhotoStr });
  } catch (error) {
    res.status(500).json({ error: 'Failed to save profile photo', details: error.message });
  }
});

// Upload question image (base64 dataUrl)
app.post('/api/uploads/question-image', async (req, res) => {
  try {
    const { dataUrl, filename } = req.body || {};
    if (!dataUrl || typeof dataUrl !== 'string') {
      return res.status(400).json({ error: 'dataUrl is required' });
    }

    const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
    if (!match) {
      return res.status(400).json({ error: 'Invalid dataUrl format' });
    }

    const mime = match[1];
    const b64 = match[2];

    const extMap = {
      'image/png': 'png',
      'image/jpeg': 'jpg',
      'image/jpg': 'jpg',
      'image/webp': 'webp'
    };
    const ext = extMap[mime] || 'png';

    const safeBase = filename ? String(filename).replace(/[^a-zA-Z0-9._-]/g, '_') : 'question';
    const outDir = path.join(uploadsDir, 'question-images');
    if (!fs.existsSync(outDir)) {
      fs.mkdirSync(outDir, { recursive: true });
    }

    const unique = `${Date.now()}_${Math.random().toString(16).slice(2)}`;
    const outName = `${unique}_${safeBase}.${ext}`;
    const outPath = path.join(outDir, outName);

    fs.writeFileSync(outPath, Buffer.from(b64, 'base64'));

    res.json({ imageUrl: `/uploads/question-images/${outName}` });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upload image', details: error.message });
  }
});

// Authentication endpoint
app.post('/api/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required' });
    }
    
    // Find user in database
    const user = await prisma.user.findUnique({
      where: { email },
      include: {
        student: true,
        teacher: true
      }
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    let isValidPassword = false;
    if (typeof user.passwordHash === 'string' && user.passwordHash.startsWith('$2')) {
      isValidPassword = await bcrypt.compare(password, user.passwordHash);
    } else {
      isValidPassword = password === user.passwordHash;
    }

    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // Return user info without password
    const { passwordHash, ...userWithoutPassword } = user;
    res.json({ 
      user: userWithoutPassword,
      role: user.role 
    });
  } catch (error) {
    res.status(500).json({ error: 'Login failed', details: error.message });
  }
});

// Student profile (for dashboard/profile sidebar)
app.get('/api/students/profile', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: {
        student: { include: { class: true } }
      }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can access student profile' });
    }

    res.json({
      userId: user.id,
      studentId: user.student.id,
      className: user.student.class?.className || null,
      section: user.student.class?.section || null,
      rollNo: user.student.rollNo || null,
      admissionDate: user.student.admissionDate || null,
      dateOfBirth: user.student.dateOfBirth || null,
      gender: user.student.gender || null,
      guardianName: user.student.guardianName || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch student profile', details: error.message });
  }
});

// Upsert question source (board/paperName/year)
app.post('/api/question-sources/upsert', async (req, res) => {
  try {
    const { board, paperName, year } = req.body || {};

    const yearInt = year != null && year !== '' ? parseInt(year) : null;
    const boardStr = board != null && String(board).trim() !== '' ? String(board).trim() : null;
    const paperNameStr = paperName != null && String(paperName).trim() !== '' ? String(paperName).trim() : null;

    if (!boardStr || !paperNameStr || !yearInt || Number.isNaN(yearInt)) {
      return res.status(400).json({ error: 'board, paperName and year are required' });
    }

    const repairQuestionSourceSequence = async () => {
      // If the autoincrement sequence gets out of sync, nextval may return an existing source_id.
      // This resets the sequence to max(source_id)+1.
      await prisma.$executeRaw`
        SELECT setval(
          pg_get_serial_sequence('question_sources', 'source_id'),
          COALESCE((SELECT MAX(source_id) FROM question_sources), 0) + 1,
          false
        );
      `;
    };

    const existing = await prisma.questionSource.findFirst({
      where: {
        board: boardStr,
        paperName: paperNameStr,
        year: yearInt
      }
    });
    if (existing) {
      return res.json({ id: existing.id, board: existing.board, paperName: existing.paperName, year: existing.year });
    }

    const createSource = async () => {
      return prisma.questionSource.create({
        data: {
          board: boardStr,
          paperName: paperNameStr,
          year: yearInt
        }
      });
    };

    let source;
    try {
      source = await createSource();
    } catch (e) {
      const msg = String(e?.message || '');
      const isSourceIdUnique = msg.includes('Unique constraint failed') && msg.includes('source_id');

      if (isSourceIdUnique) {
        await repairQuestionSourceSequence();
        source = await createSource();
      } else {
        throw e;
      }
    }

    res.json({ id: source.id, board: source.board, paperName: source.paperName, year: source.year });
  } catch (error) {
    res.status(500).json({ error: 'Failed to upsert question source', details: error.message });
  }
});

// List question sources
app.get('/api/question-sources', async (req, res) => {
  try {
    const { board, year } = req.query || {};
    const where = {};

    if (board != null && String(board).trim() !== '') {
      where.board = String(board).trim();
    }

    if (year != null && String(year).trim() !== '') {
      const yearInt = parseInt(String(year), 10);
      if (Number.isNaN(yearInt)) {
        return res.status(400).json({ error: 'Invalid year' });
      }
      where.year = yearInt;
    }

    const sources = await prisma.questionSource.findMany({
      where,
      select: {
        id: true,
        board: true,
        paperName: true,
        year: true,
        createdAt: true
      },
      orderBy: [{ year: 'desc' }, { paperName: 'asc' }, { createdAt: 'desc' }]
    });

    res.json(sources);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch question sources', details: error.message });
  }
});

// Get classes
app.get('/api/classes', async (req, res) => {
  try {
    const classes = await prisma.class.findMany({
      select: {
        id: true,
        className: true,
        section: true
      },
      orderBy: {
        className: 'asc'
      }
    });
    res.json(classes);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch classes', details: error.message });
  }
});

// Get subjects
app.get('/api/subjects', async (req, res) => {
  try {
    const subjects = await prisma.subject.findMany({
      select: {
        id: true,
        subjectName: true
      },
      orderBy: {
        subjectName: 'asc'
      }
    });
    res.json(subjects);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch subjects', details: error.message });
  }
});

// Get analytics data
app.get('/api/analytics', async (req, res) => {
  try {
    const { class: className, section, subject } = req.query;
    
    // Build where clause
    const whereClause = {};
    
    if (className && className !== 'All') {
      whereClause.class = {
        className: className
      };
    }
    
    if (section && section !== 'All') {
      if (whereClause.class) {
        whereClause.class.section = section;
      } else {
        whereClause.class = { section: section };
      }
    }
    
    if (subject && subject !== 'All') {
      whereClause.subject = {
        subjectName: subject
      };
    }

    // Get test attempts with results
    const attempts = await prisma.attempt.findMany({
      where: {
        test: {
          ...whereClause.class && { class: whereClause.class },
          ...whereClause.subject && { subject: whereClause.subject }
        }
      },
      include: {
        result: true,
        test: {
          select: {
            totalMarks: true
          }
        }
      }
    });

    // Calculate analytics
    const totalTests = attempts.length;
    const passedTests = attempts.filter(attempt => 
      attempt.result && attempt.result.status === 'Pass'
    ).length;
    const failedTests = totalTests - passedTests;

    // Get subject performance
    const subjectPerformance = await prisma.attempt.groupBy({
      by: ['test'],
      where: {
        test: {
          ...whereClause.class && { class: whereClause.class },
          ...whereClause.subject && { subject: whereClause.subject }
        }
      },
      _avg: {
        percentage: true
      },
      _count: {
        id: true
      }
    });

    // Get top scorers
    const topScorers = await prisma.attempt.findMany({
      where: {
        test: {
          ...whereClause.class && { class: whereClause.class },
          ...whereClause.subject && { subject: whereClause.subject }
        }
      },
      include: {
        student: {
          include: {
            user: {
              select: {
                name: true
              }
            }
          }
        },
        result: true
      },
      orderBy: {
        percentage: 'desc'
      },
      take: 3
    });

    res.json({
      testAnalytics: {
        totalTests,
        passed: passedTests,
        failed: failedTests
      },
      subjectPerformance: subjectPerformance.map(item => ({
        subject: item.test.subject?.subjectName || 'Unknown',
        score: Math.round(item._avg.percentage?.toNumber() || 0),
        totalTests: item._count.id
      })),
      topScorers: topScorers.map((scorer, index) => ({
        name: scorer.student.user.name,
        score: `${scorer.totalScore}/${scorer.test.totalMarks}`,
        rank: index + 1
      }))
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch analytics', details: error.message });
  }
});

// Get question bank (old papers)
app.get('/api/question-bank', async (req, res) => {
  try {
    const { board, class: className, subject, year } = req.query;
    
    const whereClause = {};
    if (board) whereClause.source = { board: board };
    if (className) whereClause.class = { className: className };
    if (subject) whereClause.subject = { subjectName: subject };
    if (year) whereClause.source = { ...whereClause.source, year: parseInt(year) };

    const questions = await prisma.questionBank.findMany({
      where: whereClause,
      include: {
        class: {
          select: {
            className: true
          }
        },
        subject: {
          select: {
            subjectName: true
          }
        },
        source: {
          select: {
            board: true,
            paperName: true,
            year: true
          }
        },
        options: true,
        correctAnswer: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(questions);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch question bank', details: error.message });
  }
});

const parseNumericClassName = (value) => {
  if (!value) return null;
  const match = String(value).match(/\d+/);
  return match ? match[0] : null;
};

const decimalToNumber = (v) => {
  if (v == null) return 0;
  if (typeof v === 'number') return v;
  if (typeof v === 'string') return parseFloat(v);
  if (typeof v.toNumber === 'function') return v.toNumber();
  return parseFloat(String(v));
};

app.post('/api/mock-tests/start', async (req, res) => {
  try {
    const { userId, subject, numberOfQuestions } = req.body;

    const uid = parseInt(userId);
    const n = parseInt(numberOfQuestions);
    if (!uid || !subject || !n || n <= 0) {
      return res.status(400).json({ error: 'userId, subject, numberOfQuestions are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: {
        student: { include: { class: true } }
      }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can start mock tests' });
    }

    const rawSubject = String(subject || '').trim();
    const normalized = rawSubject.toLowerCase();
    const subjectAliases = new Set([
      normalized,
      normalized.replace(/\s+/g, ''),
    ]);
    if (subjectAliases.has('math') || subjectAliases.has('maths') || subjectAliases.has('mathematics')) {
      subjectAliases.add('math');
      subjectAliases.add('maths');
      subjectAliases.add('mathematics');
    }

    const or = Array.from(subjectAliases)
      .filter(Boolean)
      .map((s) => ({ subjectName: { equals: s, mode: 'insensitive' } }));

    // Fallback: if maths-like, match any subject containing "math" (covers "Mathematics")
    if (subjectAliases.has('math') || subjectAliases.has('maths') || subjectAliases.has('mathematics')) {
      or.push({ subjectName: { contains: 'math', mode: 'insensitive' } });
    }

    const subjectRow = await prisma.subject.findFirst({
      where: {
        OR: or.length > 0 ? or : [{ subjectName: { equals: rawSubject, mode: 'insensitive' } }]
      }
    });

    if (!subjectRow) {
      return res.status(404).json({ error: 'Subject not found' });
    }

    const classId = user.student.classId;

    const questionIds = await prisma.$queryRaw`
      SELECT qb_question_id as id
      FROM question_bank
      WHERE class_id = ${classId}
        AND subject_id = ${subjectRow.id}
        AND is_active = true
      ORDER BY RANDOM()
      LIMIT ${n}
    `;

    const qbIds = (questionIds || []).map((r) => Number(r.id)).filter((x) => Number.isFinite(x));

    if (qbIds.length !== n) {
      return res.status(400).json({
        error: 'Not enough questions in question bank for this class/subject',
        available: qbIds.length
      });
    }

    const qbQuestions = await prisma.questionBank.findMany({
      where: { id: { in: qbIds } },
      include: { options: true, correctAnswer: true }
    });

    const questionById = new Map(qbQuestions.map((q) => [q.id, q]));
    const orderedQuestions = qbIds.map((id) => questionById.get(id)).filter(Boolean);

    let durationMin = 0;
    let totalMarks = 0;
    let mcqCount = 0;
    let subjectiveCount = 0;

    for (const q of orderedQuestions) {
      const isMcq = q.questionType === 'MCQ';
      if (isMcq) {
        durationMin += 1;
        mcqCount += 1;
      } else {
        durationMin += 2;
        subjectiveCount += 1;
      }
      totalMarks += decimalToNumber(q.marks);
    }

    const passingMarks = totalMarks * 0.33;
    const title = `${subjectRow.subjectName} Mock Test`;

    const created = await prisma.$transaction(async (tx) => {
      const test = await tx.test.create({
        data: {
          title,
          description: 'Student Mock Test',
          testType: 'MOCK',
          classId,
          subjectId: subjectRow.id,
          createdById: user.id,
          totalMarks,
          durationMin,
          passingMarks,
          status: 'PUBLISHED',
          negativeMarking: false,
          negativeMarksPerWrong: 0,
          shuffleQuestions: false,
          shuffleOptions: false
        }
      });

      await tx.mockTestConfig.create({
        data: {
          testId: test.id,
          numberOfQuestions: n
        }
      });

      await tx.testQuestion.createMany({
        data: qbIds.map((qid, idx) => ({
          testId: test.id,
          questionId: qid,
          orderNo: idx + 1
        }))
      });

      const attempt = await tx.attempt.create({
        data: {
          testId: test.id,
          studentId: user.student.id,
          status: 'STARTED',
          totalScore: 0,
          percentage: 0,
          isResultPublished: true
        }
      });

      return { test, attempt };
    });

    res.json({
      attemptId: created.attempt.id,
      testId: created.test.id,
      subject: subjectRow.subjectName,
      totalQuestions: n,
      durationMin,
      counts: { mcq: mcqCount, subjective: subjectiveCount }
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to start mock test', details: error.message });
  }
});

app.get('/api/mock-tests/attempt/:attemptId', async (req, res) => {
  try {
    const attemptId = parseInt(req.params.attemptId);
    const userId = parseInt(req.query.userId);

    if (!attemptId || !userId) {
      return res.status(400).json({ error: 'attemptId and userId are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can access mock attempts' });
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        student: { include: { user: true, class: true } },
        test: {
          include: {
            subject: true,
            class: true,
            mockConfig: true,
            testQuestions: {
              orderBy: { orderNo: 'asc' },
              include: {
                question: { include: { options: true, correctAnswer: true } }
              }
            }
          }
        }
      }
    });

    if (!attempt || attempt.studentId !== user.student.id) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const questions = attempt.test.testQuestions.map((tq) => {
      const q = tq.question;
      const isMcq = q.questionType === 'MCQ';
      return {
        orderNo: tq.orderNo,
        questionId: q.id,
        questionType: q.questionType,
        type: isMcq ? 'objective' : 'subjective',
        questionText: q.questionText,
        marks: decimalToNumber(q.marks),
        options: isMcq
          ? q.options
              .sort((a, b) => a.orderNo - b.orderNo)
              .map((o) => ({ id: o.id, text: o.optionText }))
          : []
      };
    });

    let mcqCount = 0;
    let subjectiveCount = 0;
    for (const q of attempt.test.testQuestions) {
      if (q.question.questionType === 'MCQ') mcqCount += 1;
      else subjectiveCount += 1;
    }

    res.json({
      attemptId: attempt.id,
      testId: attempt.test.id,
      subject: attempt.test.subject.subjectName,
      className: attempt.test.class.className,
      totalQuestions: attempt.test.mockConfig?.numberOfQuestions || questions.length,
      durationMin: attempt.test.durationMin,
      counts: { mcq: mcqCount, subjective: subjectiveCount },
      questions
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch attempt', details: error.message });
  }
});

app.get('/api/mock-tests/attempt/:attemptId/responses', async (req, res) => {
  try {
    const attemptId = parseInt(req.params.attemptId);
    const userId = parseInt(req.query.userId);

    if (!attemptId || !userId) {
      return res.status(400).json({ error: 'attemptId and userId are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can access responses' });
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        student: true,
        test: {
          include: {
            subject: true,
            testQuestions: {
              orderBy: { orderNo: 'asc' },
              include: {
                question: { include: { options: true, correctAnswer: true } }
              }
            }
          }
        }
      }
    });

    if (!attempt || attempt.studentId !== user.student.id) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const answers = await prisma.answer.findMany({
      where: { attemptId: attempt.id },
      include: { selectedOption: true }
    });
    const answerByQuestionId = new Map(answers.map((a) => [a.questionId, a]));

    const responses = attempt.test.testQuestions.map((tq) => {
      const q = tq.question;
      const isMcq = q.questionType === 'MCQ';
      const ans = answerByQuestionId.get(q.id);

      const correctOption = isMcq ? q.options.find((o) => o.isCorrect) : null;
      const correctAnswerText = isMcq ? (correctOption ? correctOption.optionText : null) : (q.correctAnswer?.correct ?? null);

      const studentAnswerText = isMcq
        ? (ans?.selectedOption?.optionText ?? null)
        : (ans?.answerText != null ? String(ans.answerText) : null);

      return {
        orderNo: tq.orderNo,
        questionId: q.id,
        questionType: q.questionType,
        questionText: q.questionText,
        marks: decimalToNumber(q.marks),
        correctAnswer: correctAnswerText,
        studentAnswer: studentAnswerText,
        marksObtained: ans ? decimalToNumber(ans.marksObtained) : null,
        similarityScore: ans?.similarityScore != null ? decimalToNumber(ans.similarityScore) : null,
        evaluationType: ans?.evaluationType ?? null
      };
    });

    res.json({
      attemptId: attempt.id,
      testId: attempt.test.id,
      subject: attempt.test.subject.subjectName,
      responses
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch responses', details: error.message });
  }
});

app.post('/api/mock-tests/attempt/:attemptId/submit', async (req, res) => {
  try {
    const attemptId = parseInt(req.params.attemptId);
    const { userId, answers } = req.body;
    const uid = parseInt(userId);

    if (!attemptId || !uid) {
      return res.status(400).json({ error: 'attemptId and userId are required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { student: true }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can submit mock attempts' });
    }

    const attempt = await prisma.attempt.findUnique({
      where: { id: attemptId },
      include: {
        test: {
          include: {
            subject: true,
            testQuestions: {
              orderBy: { orderNo: 'asc' },
              include: {
                question: { include: { options: true, correctAnswer: true } }
              }
            }
          }
        }
      }
    });

    if (!attempt || attempt.studentId !== user.student.id) {
      return res.status(404).json({ error: 'Attempt not found' });
    }

    const answerList = Array.isArray(answers) ? answers : [];
    const answerMap = new Map(answerList.map((a) => [Number(a.questionId), a]));

    let obtainedMarks = 0;
    const totalMarks = decimalToNumber(attempt.test.totalMarks);

    const evaluatedAnswers = [];

    for (const tq of attempt.test.testQuestions) {
      const q = tq.question;
      const submitted = answerMap.get(q.id);
      
      let answerText = null;
      let selectedOptionId = null;
      let marksObtained = 0;
      let isCorrect = null;
      let similarityScore = null;

      // =========================
      // OBJECTIVE (MCQ) EVALUATION
      // =========================
      if (q.questionType === 'MCQ') {
        selectedOptionId = submitted?.selectedOptionId ?? null;

        if (selectedOptionId) {
          const opt = q.options.find(o => o.id === selectedOptionId);
          isCorrect = opt?.isCorrect ?? false;
          marksObtained = isCorrect ? decimalToNumber(q.marks) : 0;
        } else {
          isCorrect = false;
          marksObtained = 0;
        }
      }

      // =========================
      // SUBJECTIVE (ML) EVALUATION
      // =========================
      if (q.questionType === 'SUBJECTIVE') {
        answerText = submitted?.answerText ?? null;
        const correct = q.correctAnswer?.correct;

        if (
          answerText &&
          typeof answerText === 'string' &&
          answerText.trim() !== '' &&
          correct
        ) {
          try {
            const mlRes = await axios.post(
              'http://localhost:8001/evaluate',
              {
                correct_answer: correct,
                student_answer: answerText,
                max_marks: decimalToNumber(q.marks)
              },
              { timeout: 5000 }
            );

            marksObtained = Number(mlRes.data.marks_obtained);
            similarityScore = mlRes.data.similarity_score;
            isCorrect = marksObtained > 0;

          } catch (err) {
            console.error('ML failed:', err.message);
            marksObtained = 0;
            isCorrect = null;
          }
        }
      }

      obtainedMarks += marksObtained;

      evaluatedAnswers.push({
        questionId: q.id,
        selectedOptionId,
        answerText,
        marksObtained,
        isCorrect,
        similarityScore
      });
    }
   


    await prisma.$transaction(async (tx) => {
      for (const ans of evaluatedAnswers) {
        await tx.answer.upsert({
          where: {
            attemptId_questionId: {
              attemptId: attempt.id,
              questionId: ans.questionId
            }
          },
          create: {
            attemptId: attempt.id,
            questionId: ans.questionId,
            selectedOptionId: ans.selectedOptionId,
            answerText: ans.answerText,
            marksObtained: ans.marksObtained,
            isCorrect: ans.isCorrect,
            similarityScore: ans.similarityScore,
            evaluationType: ans.similarityScore !== null ? 'AUTO' : null
          },
          update: {
            selectedOptionId: ans.selectedOptionId,
            answerText: ans.answerText,
            marksObtained: ans.marksObtained,
            isCorrect: ans.isCorrect,
            similarityScore: ans.similarityScore,
            evaluationType: ans.similarityScore !== null ? 'AUTO' : null
          }
        });
      }

      const percentage = totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0;
      const passingMarks = decimalToNumber(attempt.test.passingMarks);
      const status = obtainedMarks >= passingMarks ? 'Pass' : 'Fail';

      await tx.attempt.update({
        where: { id: attempt.id },
        data: {
          submittedAt: new Date(),
          status: 'SUBMITTED',
          totalScore: obtainedMarks,
          percentage
        }
      });

      await tx.result.upsert({
        where: { attemptId: attempt.id },
        create: {
          attemptId: attempt.id,
          totalMarks,
          obtainedMarks,
          percentage,
          published: true,
          status
        },
        update: {
          totalMarks,
          obtainedMarks,
          percentage,
          published: true,
          status
        }
      });
    });

    const updated = await prisma.result.findUnique({
      where: { attemptId: attempt.id }
    });

    res.json({
      attemptId: attempt.id,
      testId: attempt.test.id,
      subject: attempt.test.subject.subjectName,
      totalMarks: totalMarks,
      obtainedMarks: updated ? decimalToNumber(updated.obtainedMarks) : obtainedMarks,
      percentage: updated ? decimalToNumber(updated.percentage) : (totalMarks > 0 ? (obtainedMarks / totalMarks) * 100 : 0),
      status: updated?.status || null
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to submit attempt', details: error.message });
  }
});

app.get('/api/results', async (req, res) => {
  try {
    const userId = parseInt(req.query.userId);
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      include: { student: true }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can view results' });
    }

    const results = await prisma.result.findMany({
      where: {
        attempt: {
          studentId: user.student.id
        }
      },
      include: {
        attempt: {
          include: {
            test: {
              include: {
                subject: true,
                mockConfig: true,
                testQuestions: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(
      results.map((r) => {
        const startedAt = r.attempt?.startedAt ? new Date(r.attempt.startedAt) : null;
        const submittedAt = r.attempt?.submittedAt ? new Date(r.attempt.submittedAt) : null;
        const timeTakenSec =
          startedAt && submittedAt
            ? Math.max(0, Math.floor((submittedAt.getTime() - startedAt.getTime()) / 1000))
            : null;

        return {
          id: r.id,
          attemptId: r.attemptId,
          testId: r.attempt.testId,
          subject: r.attempt.test.subject.subjectName,
          testType: r.attempt.test.testType,
          date: r.createdAt,
          totalQuestions:
            r.attempt.test.mockConfig?.numberOfQuestions ||
            (Array.isArray(r.attempt.test.testQuestions) ? r.attempt.test.testQuestions.length : null),
          durationMin: r.attempt.test.durationMin,
          timeTakenSec,
          timeTakenMin: timeTakenSec != null ? Math.ceil(timeTakenSec / 60) : null,
          totalMarks: decimalToNumber(r.totalMarks),
          obtainedMarks: decimalToNumber(r.obtainedMarks),
          percentage: decimalToNumber(r.percentage),
          status: r.status,
          published: r.published
        };
      })
    );
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch results', details: error.message });
  }
});

// Add question to bank
app.post('/api/question-bank', async (req, res) => {
  try {
    const {
      classId,
      subjectId,
      sourceId,
      questionText,
      questionType,
      marks,
      difficulty,
      imageUrl,
      options,
      correctAnswer
    } = req.body;

    const toInt = (v) => {
      if (v == null || v === '') return null;
      const n = typeof v === 'number' ? v : parseInt(String(v), 10);
      return Number.isFinite(n) ? n : null;
    };

    const classIdInt = toInt(classId);
    const subjectIdInt = toInt(subjectId);
    const sourceIdInt = toInt(sourceId);

    if (!classIdInt || !subjectIdInt) {
      return res.status(400).json({ error: 'classId and subjectId are required' });
    }
    if (!questionText || String(questionText).trim() === '') {
      return res.status(400).json({ error: 'questionText is required' });
    }
    if (!questionType || typeof questionType !== 'string') {
      return res.status(400).json({ error: 'questionType is required' });
    }
    const allowedTypes = ['MCQ', 'TRUE_FALSE', 'INTEGER', 'SHORT', 'SUBJECTIVE'];
    if (!allowedTypes.includes(questionType)) {
      return res.status(400).json({ error: 'Invalid questionType' });
    }

    const marksNum = marks != null && marks !== '' ? parseFloat(String(marks)) : null;
    if (!marksNum || Number.isNaN(marksNum) || marksNum <= 0) {
      return res.status(400).json({ error: 'Invalid marks' });
    }

    if (questionType === 'MCQ') {
      if (!Array.isArray(options) || options.length === 0) {
        return res.status(400).json({ error: 'options are required for MCQ' });
      }
      const hasCorrect = options.some((o) => !!o?.isCorrect);
      if (!hasCorrect) {
        return res.status(400).json({ error: 'At least one option must be correct' });
      }
    } else {
      if (!correctAnswer || String(correctAnswer).trim() === '') {
        return res.status(400).json({ error: 'correctAnswer is required for non-MCQ questions' });
      }
    }

    const repairQuestionBankSequence = async () => {
      await prisma.$executeRaw`
        SELECT setval(
          pg_get_serial_sequence('question_bank', 'qb_question_id'),
          COALESCE((SELECT MAX(qb_question_id) FROM question_bank), 0) + 1,
          false
        );
      `;
    };

    const createInTransaction = async () => {
      return prisma.$transaction(async (tx) => {
        if (sourceIdInt) {
          const found = await tx.questionSource.findUnique({ where: { id: sourceIdInt } });
          if (!found) {
            throw new Error('Invalid sourceId');
          }
        }

        const created = await tx.questionBank.create({
          data: {
            classId: classIdInt,
            subjectId: subjectIdInt,
            sourceId: sourceIdInt || null,
            questionText: String(questionText),
            questionType,
            marks: marksNum,
            difficulty: difficulty || 'MEDIUM',
            imageUrl: imageUrl ? String(imageUrl) : null
          }
        });

        if (questionType === 'MCQ' && options && options.length > 0) {
          for (let i = 0; i < options.length; i++) {
            await tx.questionBankOption.create({
              data: {
                questionId: created.id,
                optionText: options[i].text,
                isCorrect: options[i].isCorrect || false,
                orderNo: i + 1
              }
            });
          }
        }

        if (questionType !== 'MCQ' && correctAnswer) {
          await tx.questionBankCorrectAnswer.create({
            data: {
              questionId: created.id,
              correct: correctAnswer
            }
          });
        }

        return created;
      });
    };

    let newQuestion;
    try {
      newQuestion = await createInTransaction();
    } catch (e) {
      const msg = String(e?.message || '');
      const isQbIdUnique = msg.includes('Unique constraint failed') && msg.includes('qb_question_id');

      if (isQbIdUnique) {
        await repairQuestionBankSequence();
        newQuestion = await createInTransaction();
      } else {
        throw e;
      }
    }

    res.json(newQuestion);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add question', details: error.message });
  }
});

// Delete question from bank
app.delete('/api/question-bank/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    await prisma.questionBank.delete({
      where: { id: parseInt(id) }
    });

    res.json({ message: 'Question deleted successfully' });
  } catch (error) {
    res.status(500).json({ error: 'Failed to delete question', details: error.message });
  }
});

// Get tests
app.get('/api/tests', async (req, res) => {
  try {
    const { class: className, subject, testType } = req.query;
    
    const whereClause = {};
    if (className && className !== 'All') {
      whereClause.class = { className: className };
    }
    if (subject && subject !== 'All') {
      whereClause.subject = { subjectName: subject };
    }
    if (testType) {
      whereClause.testType = testType;
    }

    const tests = await prisma.test.findMany({
      where: whereClause,
      include: {
        class: {
          select: {
            className: true,
            section: true
          }
        },
        subject: {
          select: {
            subjectName: true
          }
        },
        createdBy: {
          select: {
            name: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(tests);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch tests', details: error.message });
  }
});

// Create test
app.post('/api/tests', async (req, res) => {
  try {
    const {
      title,
      description,
      testType,
      classId,
      subjectId,
      totalMarks,
      durationMin,
      passingMarks,
      negativeMarking,
      negativeMarksPerWrong,
      shuffleQuestions,
      shuffleOptions,
      questions
    } = req.body;

    const newTest = await prisma.test.create({
      data: {
        title,
        description,
        testType,
        classId: parseInt(classId),
        subjectId: parseInt(subjectId),
        totalMarks: parseFloat(totalMarks),
        durationMin: parseInt(durationMin),
        passingMarks: parseFloat(passingMarks),
        negativeMarking: negativeMarking || false,
        negativeMarksPerWrong: parseFloat(negativeMarksPerWrong) || 0,
        shuffleQuestions: shuffleQuestions !== false,
        shuffleOptions: shuffleOptions !== false,
        createdById: req.user?.id || null // Will be set after auth
      }
    });

    // Add questions to test
    if (questions && questions.length > 0) {
      for (let i = 0; i < questions.length; i++) {
        await prisma.testQuestion.create({
          data: {
            testId: newTest.id,
            questionId: questions[i].questionId,
            orderNo: i + 1
          }
        });
      }
    }

    res.json(newTest);
  } catch (error) {
    res.status(500).json({ error: 'Failed to create test', details: error.message });
  }
});

// Get notifications
app.get('/api/notifications', async (req, res) => {
  try {
    const { userId } = req.query;

    // For students: return notifications only for their class (Notification.classId)
    if (!userId) {
      return res.status(400).json({ error: 'userId is required' });
    }

    const uid = parseInt(userId);
    const user = await prisma.user.findUnique({
      where: { id: uid },
      include: { student: true }
    });

    if (!user || user.role !== 'STUDENT' || !user.student) {
      return res.status(403).json({ error: 'Only students can access notifications' });
    }

    const notifications = await prisma.notification.findMany({
      where: {
        classId: user.student.classId
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to fetch notifications', details: error.message });
  }
});

// Add notification
app.post('/api/notifications', async (req, res) => {
  try {
    const { title, message, userIds, classId, classIds } = req.body;

    if (!title || !message) {
      return res.status(400).json({ error: 'title and message are required' });
    }

    const notifications = [];

    // Preferred: create notification(s) by classId(s)
    const classIdList = [];
    if (classId != null) classIdList.push(parseInt(classId));
    if (Array.isArray(classIds)) {
      for (const cid of classIds) classIdList.push(parseInt(cid));
    }

    for (const cid of classIdList.filter((x) => Number.isFinite(x))) {
      const notification = await prisma.notification.create({
        data: {
          classId: cid,
          title,
          message
        }
      });
      notifications.push(notification);
    }

    // Backward compatibility: if userIds sent, map each user -> student.classId
    if (Array.isArray(userIds) && userIds.length > 0) {
      for (const uidRaw of userIds) {
        const uid = parseInt(uidRaw);
        if (!uid) continue;

        const user = await prisma.user.findUnique({
          where: { id: uid },
          include: { student: true }
        });
        if (!user?.student?.classId) continue;

        const notification = await prisma.notification.create({
          data: {
            classId: user.student.classId,
            title,
            message
          }
        });
        notifications.push(notification);
      }
    }

    res.json(notifications);
  } catch (error) {
    res.status(500).json({ error: 'Failed to add notification', details: error.message });
  }
});

// Error handling middleware
app.use((error, req, res, next) => {
  console.error(error.stack);
  res.status(500).json({ error: 'Something went wrong!' });
});

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  await prisma.$disconnect();
  process.exit(0);
});

module.exports = app;


