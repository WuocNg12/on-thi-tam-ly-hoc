const firebaseConfig = {
    apiKey: "AIzaSyD86_u0FPsvVq-s7SDnH8MWDtRUHiXVDqw",
    authDomain: "databasevip-77223.firebaseapp.com",
    projectId: "databasevip-77223",
    storageBucket: "databasevip-77223.firebasestorage.app",
    messagingSenderId: "596282142686",
    appId: "1:596282142686:web:965ecdb7be5caf3b65f74f",
    measurementId: "G-TWT8VB3KRG"
};

const ADMIN_EMAILS = ["quocaaaa120@gmail.com"]; // Danh sách email được cấp quyền Admin

let app, auth, db, provider;
let currentUser = null;
let isAdmin = false;
let isFirebaseActive = false;

let dbData = [...window.PSY_QUESTIONS];
let quizData = []; // Data dùng để thi (có thể bị đảo)
let currentQuestion = 0;
let currentMode = 'practice';
let userAnswers = {};
let examTimer = null;
let elapsedSeconds = 0;
let isShuffled = false;
let examSubmitted = false;      // chặn nộp bài nhiều lần
let lastSubmittedExamNo = 0;    // số đề vừa nộp (để nút "Xem câu sai" nhảy đúng đề)

const questionEl = document.getElementById('question');
const optionsEl = document.getElementById('options');
const progressEl = document.getElementById('progress');
const btnPrev = document.getElementById('btn-prev');
const btnNext = document.getElementById('btn-next');
const timerEl = document.getElementById('timer');
const quizCard = document.getElementById('quiz-card');
const resultsCard = document.getElementById('results-card');
const jumpInput = document.getElementById('jump-input');
const btnShuffle = document.getElementById('btn-shuffle');

const QUESTIONS = 'tamlyhoc_questions';
const LEADERBOARD = 'tamlyhoc_leaderboard';
const scopeSelect = document.getElementById('practice-scope');
const autoNext = document.getElementById('auto-next');
const reviewBox = document.getElementById('review-content');
const reviewToggle = document.getElementById('review-toggle');
const feedback = document.getElementById('feedback');
let collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit, serverTimestamp, writeBatch;
let signInWithPopup, signOut;
let advanceTimeout;
let scope = 'all';
let viewingTheory = false;

async function connectFirebase() {
    const hint = document.getElementById('login-hint');
    if (location.protocol === 'file:') {
        hint.textContent = 'Đang ôn trên máy';
        return;
    }
    try {
        const base = 'https://www.gstatic.com/firebasejs/10.8.1/';
        const [core, login, store] = await Promise.all(['firebase-app.js', 'firebase-auth.js', 'firebase-firestore.js'].map(file => import(base + file)));
        ({collection, addDoc, getDocs, doc, updateDoc, deleteDoc, query, orderBy, limit, serverTimestamp, writeBatch} = store);
        ({signInWithPopup, signOut} = login);
        app = core.initializeApp(firebaseConfig);
        auth = login.getAuth(app);
        db = store.getFirestore(app);
        provider = new login.GoogleAuthProvider();
        isFirebaseActive = true;
        login.onAuthStateChanged(auth, user => {
            const changed = currentUser?.uid !== user?.uid;
            currentUser = user;
            isAdmin = !!(user?.emailVerified && ADMIN_EMAILS.includes(user.email));
            document.getElementById('login-text').textContent = user ? user.displayName || 'Tài khoản' : 'Đăng nhập';
            document.getElementById('google-icon').style.display = user ? 'none' : '';
            const avatar = document.getElementById('user-avatar');
            avatar.style.display = user?.photoURL ? 'block' : 'none';
            if (user?.photoURL) avatar.src = user.photoURL;
            hint.textContent = user ? 'Đã đăng nhập Google' : 'Đăng nhập để xếp hạng';
            document.getElementById('btn-admin').style.display = isAdmin ? 'block' : 'none';
            document.getElementById('btn-edit-current').style.display = isAdmin ? 'block' : 'none';
            if (changed) {
                const wasReading = viewingTheory;
                scope = lsGet('scope', 'all');
                populateScope();
                isShuffled = !!lsGet('shuffle', false);
                autoNext.checked = lsGet('autoNext', true);
                window.switchMode(currentMode);
                if (wasReading) window.showTheory(linkedPodcastNumber());
                renderLocalData();
            }
        });
        await fetchQuestionsFromDB();
    } catch (error) {
        hint.textContent = 'Đang dùng bộ câu hỏi trên máy';
        console.warn('Không kết nối được Firebase', error);
    }
}

window.handleLogin = async () => {
    if (!isFirebaseActive) {
        alert(location.protocol === 'file:' ? 'Mở bản GitHub Pages để đăng nhập bằng Google.' : 'Đang chờ kết nối Firebase. Bạn vẫn có thể ôn tập.');
        return;
    }
    try {
        if (!currentUser) await signInWithPopup(auth, provider);
        else if (confirm('Đăng xuất tài khoản?')) await signOut(auth);
    } catch (error) { alert('Thao tác tài khoản chưa thành công. ' + error.message); }
};

async function fetchQuestionsFromDB() {
    const snap = await getDocs(query(collection(db, QUESTIONS), orderBy('order')));
    const rows = snap.docs.map(d => ({...d.data(), id:d.id}));
    if (!rows.length) return;
    const unchanged = rows.length === dbData.length && rows.every((q,i) => {
        const old = dbData[i];
        return Object.keys(q).length === Object.keys(old).length && Object.keys(q).every(k => JSON.stringify(q[k]) === JSON.stringify(old[k]));
    });
    if (unchanged) return;
    dbData = rows;
    populateScope();
    if (currentMode === 'practice' && !viewingTheory) window.switchMode('practice');
}

function populateScope() {
    scopeSelect.replaceChildren(new Option('Toàn bộ câu hỏi', 'all'));
    const exams = [...new Set(dbData.map(q => q.exam).filter(Boolean))].sort((a,b) => a-b);
    const topics = [...new Set(dbData.map(q => q.topic).filter(Boolean))].sort((a,b) => a.localeCompare(b,'vi'));
    for (const [title, entries] of [['Đề trong file Word', exams.map(n => ['Đề gốc ' + n,'exam:' + n])],['Chủ đề', topics.map(t => [t,'topic:' + t])]]) {
        const group = document.createElement('optgroup');
        group.label = title;
        for (const [label, value] of entries) group.append(new Option(label, value));
        scopeSelect.append(group);
    }
    scopeSelect.value = scope;
    if (scopeSelect.selectedIndex < 0) scopeSelect.value = scope = 'all';
}

function practicePool() {
    if (scope.startsWith('exam:')) return dbData.filter(q => q.exam === Number(scope.slice(5)));
    if (scope.startsWith('topic:')) return dbData.filter(q => q.topic === scope.slice(6));
    return dbData;
}
// --- LOGIC LÀM BÀI ---

// THI THỬ THEO ĐỀ: mỗi đề tối đa 50 câu, các đề không trùng câu cho đến khi thi hết kho câu hỏi
const EXAM_SIZE = 50;
const FIVE_HOURS = 5 * 60 * 60 * 1000;
let examInfoText = '';

// Dữ liệu thi thử lưu ở trình duyệt (localStorage), TÁCH RIÊNG theo từng tài khoản (khách dùng chung 1 kho "guest")
function lsKey(name) { return `tamlyhoc_${name}_${currentUser ? currentUser.uid : 'guest'}`; }
function lsGet(name, fallback) {
    try {
        const v = JSON.parse(localStorage.getItem(lsKey(name)));
        return (v === null || v === undefined) ? fallback : v;
    } catch (e) { return fallback; }
}
function lsSet(name, value) { try { localStorage.setItem(lsKey(name), JSON.stringify(value)); } catch (e) {} }
function clearExamData() { ['exam_v2', 'history_v4', 'wrong_v4'].forEach(n => { try { localStorage.removeItem(lsKey(n)); } catch (e) {} }); }

// Lịch sử và câu sai tự xóa sau 5 giờ
function loadHistory() { const now = Date.now(); return lsGet('history_v4', []).filter(h => h && (!h.timestamp || now - h.timestamp <= FIVE_HOURS)); }
function loadWrong() { const now = Date.now(); return lsGet('wrong_v4', []).filter(w => w && (!w.timestamp || now - w.timestamp <= FIVE_HOURS)); }

function escapeHTML(t) { return String(t ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

function loadExamState() {
    const st = lsGet('exam_v2', null);
    if (st && Array.isArray(st.used)) {
        return { ...st, used: st.used, current: Array.isArray(st.current) ? st.current : null, done: st.done || 0 };
    }
    return { used: [], current: null, done: 0 };
}

function saveExamState(st) { lsSet('exam_v2', st); }

// --- LƯU / KHÔI PHỤC TIẾN TRÌNH LUYỆN TẬP (riêng từng tài khoản, thoát web hay đổi chế độ vẫn làm tiếp) ---
function savePracticeProgress() {
    if (currentMode !== 'practice' || quizData.length === 0 || !quizData[currentQuestion]) return;

    lsSet('practice_v1_' + scope, {
        shuffled: isShuffled,
        ids: isShuffled ? quizData.map(q => q.id) : null, // chỉ cần lưu thứ tự khi đang đảo câu
        qid: quizData[currentQuestion].id,
        index: currentQuestion
    });
}

// adoptShuffle = true: lấy luôn trạng thái "Đảo câu hỏi" đã lưu (khi mở web / đổi tài khoản)
// adoptShuffle = false: chỉ khôi phục nếu trạng thái đảo câu hiện tại trùng với lúc đã lưu
function restorePracticeProgress(adoptShuffle) {

    const st = lsGet('practice_v1_' + scope, null);
    if (!st || dbData.length === 0) return false;
    if (!adoptShuffle && !!st.shuffled !== isShuffled) return false;


    const pool = practicePool();
    let list = pool;
    if (st.shuffled && Array.isArray(st.ids)) {
        const byId = new Map(pool.map(d => [d.id, d]));
        list = st.ids.map(id => byId.get(id)).filter(Boolean);
        const known = new Set(list.map(q => q.id));
        list.push(...pool.filter(q => !known.has(q.id)));
    }
    if (list.length === 0) return false;

    let idx = st.qid ? list.findIndex(d => d.id === st.qid) : -1;
    if (idx < 0) idx = Math.min(Math.max(parseInt(st.index) || 0, 0), list.length - 1);

    quizData = list;
    currentQuestion = idx;
    isShuffled = !!st.shuffled;
    btnShuffle.classList.toggle('active', isShuffled);
    return true;
}

function shuffleArray(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
}

// Trả về danh sách câu của đề thi hiện tại, hoặc null nếu người dùng không muốn làm lại từ đầu
function prepareExam() {
    const byId = new Map(dbData.map(d => [d.id, d]));
    let st = loadExamState();
    st.used = st.used.filter(id => byId.has(id)); // bỏ các câu đã bị xóa khỏi DB
    let usedSet = new Set(st.used);
    let pool = dbData.filter(d => !usedSet.has(d.id));

    if (pool.length === 0) {
        const ok = confirm(`Bạn đã thi thử hết ${dbData.length} câu hỏi rồi!\n\nBạn có muốn bắt đầu làm lại từ đầu không?\n(Các đề đã thi, lịch sử thi thử và danh sách câu sai trước đó sẽ bị xóa.)`);
        if (!ok) return null;
        clearExamData();
        st = { used: [], current: null, done: 0 };
        usedSet = new Set();
        pool = [...dbData];
    }

    // Đề đang làm dở (chưa nộp) thì giữ nguyên, không bốc lại câu khác
    let batch = [];
    if (st.current) batch = st.current.map(id => byId.get(id)).filter(d => d && !usedSet.has(d.id));
    if (batch.length === 0) {
        batch = shuffleArray(pool).slice(0, EXAM_SIZE);
        if (!isShuffled) batch.sort((a,b) => a.order - b.order);
        st.answers = {};
        st.index = 0;
        st.seconds = 0;
    }
    st.current = batch.map(d => d.id);
    saveExamState(st);

    const totalExams = st.done + Math.ceil(pool.length / EXAM_SIZE);
    examInfoText = `Đề thi thử số ${st.done + 1}/${totalExams} · ${batch.length} câu · Đã thi ${st.used.length}/${dbData.length} câu`;
    return batch;
}


function saveExamProgress() {
    if (currentMode !== 'exam' || examSubmitted || !quizData.length) return;
    const st = loadExamState();
    if (st.current) saveExamState({...st, answers:userAnswers, index:currentQuestion, seconds:elapsedSeconds});
}

window.toggleShuffle = () => {
    isShuffled = !isShuffled;
    lsSet('shuffle', isShuffled);
    if (currentMode === 'exam') {
        const st = loadExamState();
        const id = quizData[currentQuestion].id;
        const rows = isShuffled ? shuffleArray(quizData) : [...quizData].sort((a,b) => a.order - b.order);
        saveExamState({...st, current:rows.map(q => q.id), index:rows.findIndex(q => q.id === id), answers:userAnswers, seconds:elapsedSeconds});
    }
    window.switchMode(currentMode);
};

window.showTheory = (chapter) => {
    clearTimeout(advanceTimeout);
    if (!viewingTheory) saveExamProgress();
    viewingTheory = true;
    clearInterval(examTimer);
    quizCard.style.display = 'none';
    resultsCard.style.display = 'none';
    document.getElementById('theory-panel').hidden = false;
    for (const name of ['practice','exam','theory']) document.getElementById('btn-' + name).classList.toggle('active', name === 'theory');
    window.theoryReader.open(chapter);
};
window.switchMode = (mode) => {
    if(dbData.length === 0) return;

    clearTimeout(advanceTimeout);
    if (mode === 'practice' && !viewingTheory) saveExamProgress();
    if (viewingTheory) window.theoryReader.close();
    viewingTheory = false;
    document.getElementById('theory-panel').hidden = true;
    document.getElementById('btn-theory').classList.remove('active');
    let startIndex = 0;
    if (mode === 'exam') {
        const examSet = prepareExam();
        if (examSet === null) mode = 'practice'; // Không muốn làm lại → quay về Luyện tập
        else quizData = examSet;
    }
    if (mode === 'practice') {
        if (restorePracticeProgress(false)) startIndex = currentQuestion; // làm tiếp câu đang dở
        else quizData = isShuffled ? shuffleArray(practicePool()) : practicePool();
    }

    currentMode = mode;
    document.getElementById('btn-practice').classList.toggle('active', mode === 'practice');
    document.getElementById('btn-exam').classList.toggle('active', mode === 'exam');

    const st = mode === 'exam' ? loadExamState() : {};
    userAnswers = st.answers || {};
    currentQuestion = Math.min(Math.max(0, st.index ?? startIndex), quizData.length - 1);
    elapsedSeconds = st.seconds || 0;
    btnShuffle.classList.toggle('active', isShuffled);
    btnShuffle.setAttribute('aria-pressed', String(isShuffled));
    document.getElementById('practice-tools').hidden = mode !== 'practice';
    document.getElementById('practice-review').hidden = mode !== 'practice';
    examSubmitted = false;
    btnNext.disabled = false;
    resultsCard.style.display = 'none';
    quizCard.style.display = 'block';

    const examInfoEl = document.getElementById('exam-info');
    if (mode === 'exam') {
        timerEl.style.display = 'block';
        document.getElementById('exam-info-text').textContent = examInfoText;
        examInfoEl.style.display = 'flex';
        startTimerUp();
    } else {
        timerEl.style.display = 'none';
        examInfoEl.style.display = 'none';
        clearInterval(examTimer);
    }
    loadQuestion();
};

function startTimerUp() {
    clearInterval(examTimer);
    updateTimerDisplay();
    examTimer = setInterval(() => {
        elapsedSeconds++;
        updateTimerDisplay();
    }, 1000);
}

function updateTimerDisplay() {
    let mins = Math.floor(elapsedSeconds / 60);
    let secs = elapsedSeconds % 60;
    timerEl.textContent = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

function loadQuestion() {
    if(quizData.length === 0) return;

    clearTimeout(advanceTimeout);
    reviewBox.hidden = true;
    reviewToggle.setAttribute('aria-expanded','false');
    reviewToggle.textContent = 'Xem lời giải';
    feedback.textContent = '';
    const q = quizData[currentQuestion];
    document.getElementById('question-source').textContent = [q.exam && ('Đề gốc ' + q.exam + ' · Câu ' + q.number), q.topic].filter(Boolean).join('   /   ');
    document.getElementById('meter-fill').style.width = (100 * (currentQuestion + 1) / quizData.length) + '%';
    questionEl.textContent = q.question;
    optionsEl.innerHTML = '';

    q.options.forEach((opt, index) => {
        const btn = document.createElement('button');
        btn.className = 'option';
        const letter = document.createElement('span');
        letter.className = 'choice-letter';
        letter.textContent = String.fromCharCode(65 + index);
        btn.append(letter, document.createTextNode(opt));

        if (currentMode === 'practice') {
            btn.onclick = () => window.handlePracticeClick(btn, index, q.correct);
        } else {
            if (userAnswers[quizData[currentQuestion].id] === index) {
                btn.classList.add('selected-exam');
            }
            btn.onclick = () => window.handleExamClick(index);
        }
        optionsEl.appendChild(btn);
    });

    progressEl.textContent = `${currentQuestion + 1} / ${quizData.length}`;
    jumpInput.max = quizData.length;
    btnPrev.disabled = currentQuestion === 0;

    if (currentMode === 'exam' && currentQuestion === quizData.length - 1) {
        btnNext.textContent = 'Nộp bài';
    } else {
        btnNext.textContent = 'Tiếp tục';
    }

    btnNext.disabled = currentMode === 'practice' && currentQuestion === quizData.length - 1;
    savePracticeProgress();
    saveExamProgress();
}


reviewToggle.onclick = () => {
    clearTimeout(advanceTimeout);
    const q = quizData[currentQuestion];
    reviewBox.hidden = !reviewBox.hidden;
    reviewToggle.textContent = reviewBox.hidden ? 'Xem lời giải' : 'Ẩn lời giải';
    reviewToggle.setAttribute('aria-expanded', String(!reviewBox.hidden));
    const answer = 'Đáp án ' + String.fromCharCode(65 + q.correct) + '. ' + q.options[q.correct];
    reviewBox.textContent = [answer, q.explanation, q.reference && 'Nguồn trong Word · ' + q.reference].filter(Boolean).join('\n\n');
};

window.handlePracticeClick = (btn, selectedIndex, correctIndex) => {
    const buttons = [...optionsEl.querySelectorAll('.option')];
    const right = selectedIndex === correctIndex;
    btn.classList.add(right ? 'correct' : 'incorrect');
    if (right) {
        buttons.forEach(o => o.disabled = true);
        feedback.textContent = 'Chính xác.' + (currentQuestion === quizData.length - 1 ? ' Bạn đã đến câu cuối.' : '');
        if (autoNext.checked && reviewBox.hidden && currentQuestion < quizData.length - 1) {
            advanceTimeout = setTimeout(window.nextQuestion, 550);
        }
    } else {
        btn.disabled = true;
        feedback.textContent = 'Chưa đúng. Hãy chọn lại hoặc xem lời giải.';
    }
};
window.handleExamClick = (index) => {
    userAnswers[quizData[currentQuestion].id] = index;
    const allOptions = optionsEl.querySelectorAll('.option');
    allOptions.forEach(o => o.classList.remove('selected-exam'));
    allOptions[index].classList.add('selected-exam');
    saveExamProgress();
};

window.nextQuestion = () => {
    if (currentMode === 'exam' && currentQuestion === quizData.length - 1) {
        window.submitExam();
        return;
    }
    if (currentQuestion < quizData.length - 1) {
        currentQuestion++;
        loadQuestion();
    }
};

window.prevQuestion = () => {
    if (currentQuestion > 0) {
        currentQuestion--;
        loadQuestion();
    }
};

window.jumpToQuestion = () => {
    let target = parseInt(jumpInput.value);
    if (!isNaN(target) && target >= 1 && target <= quizData.length) {
        currentQuestion = target - 1;
        loadQuestion();
        jumpInput.value = '';
    }
};

window.submitExam = async () => {
    if (examSubmitted) return; // chặn bấm "Nộp bài" nhiều lần → không lưu trùng
    examSubmitted = true;
    btnNext.disabled = true;
    clearInterval(examTimer);

    let score = 0;
    let currentWrong = [];

    quizData.forEach((q, idx) => {
        if (userAnswers[q.id] === q.correct) {
            score++;
        } else {
            currentWrong.push({
                q_text: (q.exam ? 'Đề gốc ' + q.exam + ' · Câu ' + q.number + ' — ' : '') + q.question,
                explanation: q.explanation || '',
                reference: q.reference || '',
                correct_ans: q.options[q.correct],
                user_ans: userAnswers[q.id] !== undefined ? q.options[userAnswers[q.id]] : "Chưa chọn"
            });
        }
    });

    const total = quizData.length;
    const timeStr = `${Math.floor(elapsedSeconds / 60).toString().padStart(2, '0')}:${(elapsedSeconds % 60).toString().padStart(2, '0')}`;
    const localName = currentUser ? currentUser.displayName : "Khách";
    const nowStr = new Date().toLocaleString('vi-VN');

    // Đánh dấu các câu của đề này là ĐÃ THI để đề sau bốc câu khác
    const examState = loadExamState();
    const usedSet = new Set(examState.used);
    quizData.forEach(q => usedSet.add(q.id));
    examState.used = [...usedSet];
    examState.current = null;
    examState.done = (examState.done || 0) + 1;
    saveExamState(examState);
    const examNo = examState.done;
    lastSubmittedExamNo = examNo;
    const remaining = dbData.filter(d => !usedSet.has(d.id)).length;

    // Lịch sử + câu sai (chia theo số đề): chỉ lưu trên máy này, riêng từng tài khoản, tự xóa sau 5 giờ
    const history = loadHistory();
    history.unshift({ date: nowStr, score: score, total: total, time: timeStr, name: localName, examNo: examNo, timestamp: Date.now() });
    lsSet('history_v4', history);

    const newWrong = currentWrong.map(cw => ({ ...cw, examNo: examNo, date: nowStr, timestamp: Date.now() }));
    const oldWrong = loadWrong().filter(w => w.examNo !== examNo);
    lsSet('wrong_v4', [...newWrong, ...oldWrong]);

    // Hiện kết quả ngay, việc gửi điểm lên bảng xếp hạng làm sau
    quizCard.style.display = 'none';
    resultsCard.style.display = 'block';
    document.getElementById('score-display').textContent = `${score}/${total}`;

    let msg = currentWrong.length > 0
        ? `Đề thi thử số ${examNo} · Sai ${currentWrong.length} câu.`
        : `Đề thi thử số ${examNo} · Bạn làm đúng hết!`;
    msg += `<br>Đã thi ${examState.used.length}/${dbData.length} câu.`;
    const btnRestart = document.getElementById('btn-restart');
    if (remaining > 0) {
        msg += ` Còn ${remaining} câu chưa thi.`;
        btnRestart.textContent = 'Thi đề tiếp theo';
    } else {
        msg += ' Bạn đã thi hết toàn bộ câu hỏi!';
        btnRestart.textContent = 'Làm lại từ đầu';
    }
    document.getElementById('btn-view-wrong').style.display = currentWrong.length > 0 ? '' : 'none';
    if(!currentUser && isFirebaseActive) msg += "<br><small style='color:var(--text)'>Đăng nhập để lưu điểm lên bảng xếp hạng.</small>";
    document.getElementById('result-message').innerHTML = msg;

    if (currentUser && isFirebaseActive) {
        try {
            await addDoc(collection(db, LEADERBOARD), {
                uid: currentUser.uid,
                name: currentUser.displayName || "Người học",
                photoURL: currentUser.photoURL || "",
                score: score,
                total: total,
                timeSeconds: elapsedSeconds,
                timeStr: timeStr,
                timestamp: serverTimestamp()
            });
        } catch (e) {
            console.error("Lỗi lưu điểm:", e);
            if (lastSubmittedExamNo === examNo && examSubmitted) {
                document.getElementById('result-message').append(document.createTextNode(' Điểm đã lưu trên máy. Chưa gửi được lên bảng xếp hạng.'));
            }
        }
    }
};

window.restartQuiz = () => { window.switchMode(currentMode); };

// Mở thẳng tab "Câu sai" và cuộn tới đề vừa thi
window.showWrongTab = (examNo = lastSubmittedExamNo) => {
    window.openModal('data-modal');
    window.switchTab('wrong-tab', document.getElementById('tab-btn-wrong'), 'data-modal');
    const target = examNo ? document.getElementById('wrong-exam-' + examNo) : null;
    if (target) target.scrollIntoView({ block: 'start' });
};

// Làm lại toàn bộ đề thi thử: xóa tiến trình + lịch sử + câu sai của tài khoản đang dùng, bắt đầu lại từ Đề 1
window.resetAllExams = () => {
    if (!confirm("Làm lại toàn bộ đề thi thử?\n\nTiến trình các đề đã thi, lịch sử thi thử và danh sách câu sai của tài khoản này sẽ bị xóa, bạn sẽ bắt đầu lại từ Đề 1.")) return;
    clearExamData();
    window.switchMode('exam');
};

// --- TÍNH NĂNG ADMIN ---
window.openAdminPanel = () => {
    if(!isAdmin) return;
    document.getElementById('admin-modal').style.display = 'flex';
    window.switchTab('admin-list-tab', document.querySelector('#admin-modal .tabs .tab-btn'), 'admin-modal');
    renderAdminList();
};

function renderAdminList(filterText = "") {
    const listEl = document.getElementById('admin-q-list');
    listEl.innerHTML = '';

    let filtered = dbData.filter(q => q.question.toLowerCase().includes(filterText.toLowerCase()));

    if(filtered.length === 0) {
        listEl.innerHTML = '<div style="padding: 16px; text-align: center; color: #94a3b8;">Không tìm thấy.</div>';
        return;
    }

    filtered.forEach((q, index) => {
        const item = document.createElement('div');
        item.style.cssText = "padding: 12px; border-bottom: 1px solid var(--border); display: flex; justify-content: space-between; align-items: flex-start;";
        item.innerHTML = `
            <div style="flex: 1; padding-right: 12px;">
                <div style="font-weight: 500; margin-bottom: 4px; font-size: 0.95rem;">${escapeHTML(q.question)}</div>
                <div style="font-size: 0.8rem; color: #16a34a;">ĐA đúng: ${escapeHTML(q.options[q.correct])}</div>
            </div>
            <button class="action-btn" style="padding: 4px 10px; font-size: 0.8rem;">Sửa</button>
        `;
        item.querySelector("button").onclick = () => window.prepareEditQuestion(q.id);
        listEl.appendChild(item);
    });
}

window.filterAdminQuestions = () => {
    renderAdminList(document.getElementById('admin-search').value);
};

window.prepareAddQuestion = () => {
    document.getElementById('edit-doc-id').value = '';
    document.getElementById('edit-q-text').value = '';
    document.querySelectorAll('.edit-opt-val').forEach(input => input.value = '');
    document.querySelector('input[name="correct_opt"][value="0"]').checked = true;
    document.getElementById('btn-del-q').style.display = 'none';
};

window.prepareEditQuestion = (docId) => {
    const q = dbData.find(d => d.id === docId);
    if(!q) return;

    document.getElementById('edit-doc-id').value = q.id;
    document.getElementById('edit-q-text').value = q.question;
    const inputs = document.querySelectorAll('.edit-opt-val');
    inputs.forEach(input => input.value = '');
    q.options.forEach((opt, idx) => {
        if(inputs[idx]) inputs[idx].value = opt;
    });
    document.querySelector(`input[name="correct_opt"][value="${q.correct}"]`).checked = true;

    document.getElementById('btn-del-q').style.display = 'block';

    // Chuyển tab sang Edit
    window.switchTab('admin-edit-tab', document.getElementById('tab-btn-editor'), 'admin-modal');
};

window.editCurrentQuestion = () => {
    if(!isAdmin) return;
    const q = quizData[currentQuestion];
    if(q && q.id) {
        window.openAdminPanel();
        window.prepareEditQuestion(q.id);
    }
};

window.saveQuestion = async () => {
    if (!isAdmin) return;
    const id = document.getElementById('edit-doc-id').value;
    const qText = document.getElementById('edit-q-text').value.trim();

    const values = [...document.querySelectorAll('.edit-opt-val')].map(input => input.value.trim());
    const correctIndex = Number(document.querySelector('input[name="correct_opt"]:checked').value);
    if (!values[correctIndex]) { alert('Hãy nhập nội dung cho đáp án đúng.'); return; }
    const options = values.filter(Boolean);
    const correct = values.slice(0, correctIndex).filter(Boolean).length;
    if(!qText || options.length < 2) {
        alert("Vui lòng nhập đủ câu hỏi và ít nhất 2 đáp án!"); return;
    }
    if(correct >= options.length) {
        alert("Đáp án đúng đang trỏ tới một lựa chọn trống!"); return;
    }

    const dataToSave = {
        question: qText,
        options: options,
        correct: correct,
        order: id ? dbData.find(d=>d.id===id).order : (dbData.length > 0 ? dbData[dbData.length-1].order + 1 : 1)
    };

    try {
        if(id) {
            await updateDoc(doc(db, QUESTIONS, id), dataToSave);
            alert("Cập nhật thành công!");
        } else {
            await addDoc(collection(db, QUESTIONS), dataToSave);
            alert("Thêm câu hỏi thành công!");
        }
        await fetchQuestionsFromDB(); // Reload data
        window.switchTab('admin-list-tab', document.querySelector('#admin-modal .tabs .tab-btn'), 'admin-modal');
        renderAdminList();
    } catch(e) { alert("Lỗi: " + e.message); }
};

window.deleteQuestion = async () => {
    const id = document.getElementById('edit-doc-id').value;
    if(!isAdmin || !id) return;

    if(confirm("Bạn có chắc chắn muốn XÓA VĨNH VIỄN câu hỏi này?")) {
        try {
            await deleteDoc(doc(db, QUESTIONS, id));
            alert("Đã xóa!");
            await fetchQuestionsFromDB();
            window.switchTab('admin-list-tab', document.querySelector('#admin-modal .tabs .tab-btn'), 'admin-modal');
            renderAdminList();
        } catch(e) { alert("Lỗi: " + e.message); }
    }
};

// --- MODAL & TABS ---
window.openModal = (modalId) => {
    document.getElementById(modalId).style.display = 'flex';
    if(modalId === 'data-modal') {
        renderLocalData();
        if (isFirebaseActive) fetchLeaderboard();
        else document.getElementById('leaderboard-list').textContent = 'Cần kết nối Firebase để xem bảng xếp hạng.';
    }
};

window.closeModal = (modalId) => { document.getElementById(modalId).style.display = 'none'; };

window.switchTab = (tabId, btn, modalId) => {
    const modal = document.getElementById(modalId);
    modal.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
    modal.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active'));
    document.getElementById(tabId).classList.add('active');
    btn.classList.add('active');
};

function renderLocalData() {
    const hint = `<p class="data-hint">Chỉ lưu trên máy này, riêng từng tài khoản, tự xóa sau 5 giờ.</p>`;

    const history = loadHistory();
    let hHTML = hint + (history.length > 0 ? "" : "<p class='empty-state'>Chưa có dữ liệu.</p>");
    history.forEach((h) => {
        hHTML += `<div class="history-item"><div class="lb-info"><span class="lb-name">${h.examNo ? "Đề " + h.examNo + " · " : ""}${escapeHTML(h.name)}</span><span class="lb-time">${escapeHTML(h.date)} - ${escapeHTML(h.time)}</span></div><div class="lb-score">${escapeHTML(h.score)}/${escapeHTML(h.total)}</div></div>`;
    });
    document.getElementById('history-list').innerHTML = hHTML;

    // Câu sai: gom theo số đề, đề mới nhất lên trên
    const wrong = loadWrong();
    const groups = {};
    wrong.forEach(w => { const k = w.examNo || 0; (groups[k] = groups[k] || []).push(w); });
    const examNos = Object.keys(groups).map(Number).sort((x, y) => y - x);

    let wHTML = hint;
    if (examNos.length === 0) {
        wHTML += "<p class='empty-state'>Không có câu sai.</p>";
    } else {
        wHTML += `<button class="simple-link" onclick="window.clearWrong()">Xóa danh sách</button>`;
        examNos.forEach(k => {
            const items = groups[k];
            wHTML += `<div class="wrong-exam-header" id="wrong-exam-${k}">${k ? "Đề thi thử số " + k : "Câu sai"} · sai ${items.length} câu${items[0].date ? " · " + escapeHTML(items[0].date) : ""}</div>`;
            items.forEach(w => {
                wHTML += `<div class="wrong-q-item"><div class="wrong-q-title">${escapeHTML(w.q_text)}</div><div class="wrong-q-user">Bỏ qua / Chọn sai: ${escapeHTML(w.user_ans)}</div><div class="wrong-q-correct">Đáp án đúng: ${escapeHTML(w.correct_ans)}</div><p>${escapeHTML(w.explanation)}</p><small>${escapeHTML(w.reference)}</small></div>`;
            });
        });
    }
    document.getElementById('wrong-list').innerHTML = wHTML;
}

window.clearWrong = () => { if(confirm("Xóa danh sách câu sai?")) { lsSet('wrong_v4', []); renderLocalData(); } };

async function fetchLeaderboard() {
    try {
        // Chỉ sắp xếp theo 1 trường trên server (không cần tạo Index), phần còn lại sắp xếp ở trình duyệt
        const q = query(collection(db, LEADERBOARD), orderBy("score", "desc"), limit(300));
        const querySnapshot = await getDocs(q);
        const rows = [];
        const seenKeys = new Set(); // bỏ các dòng trùng hệt nhau (cùng người, cùng điểm, cùng thời gian)
        querySnapshot.forEach((d) => {
            const x = d.data();
            const key = [x.uid, x.score, x.total, x.timeSeconds].join('|');
            if (!seenKeys.has(key)) { seenKeys.add(key); rows.push(x); }
        });
        const pct = (d) => d.total ? d.score / d.total : 0;
        rows.sort((a, b) => (pct(b) - pct(a)) || (a.timeSeconds - b.timeSeconds));
        const topRows = rows.slice(0, 50);

        if (querySnapshot.empty) { document.getElementById('leaderboard-list').innerHTML = "<p class='empty-state'>Chưa có dữ liệu.</p>"; return; }
        let lbHTML = ""; let rank = 1;
        topRows.forEach((data) => {
            let rankClass = rank <= 3 ? `rank-${rank}` : '';
            lbHTML += `<div class="leaderboard-item"><div class="rank ${rankClass}">#${rank}</div><img src="${escapeHTML(data.photoURL) || 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCI+PHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjZTIlOGRmMCIvPjwvc3ZnPg=='}" style="width: 32px; height: 32px; border-radius: 50%; margin-right: 12px; object-fit: cover;"><div class="lb-info"><span class="lb-name">${escapeHTML(data.name)}</span><span class="lb-time">${escapeHTML(data.timeStr)}</span></div><div class="lb-score">${escapeHTML(data.score)}${data.total ? "/" + escapeHTML(data.total) : ""}</div></div>`;
            rank++;
        });
        document.getElementById('leaderboard-list').innerHTML = lbHTML;
    } catch (e) { console.error("Lỗi tải bảng xếp hạng:", e); document.getElementById('leaderboard-list').innerHTML = "<p class='empty-state'>Lỗi kết nối: " + escapeHTML(e.code || e.message) + "</p>"; }
}

window.onclick = function(event) {
    if (event.target == document.getElementById('data-modal')) window.closeModal('data-modal');
    if (event.target == document.getElementById('admin-modal')) window.closeModal('admin-modal');
}


window.pushInitData = async () => {
    if (!isAdmin || !confirm('Khôi phục nội dung của 200 câu từ file Word? Các chỉnh sửa trên những câu này sẽ được thay bằng nội dung gốc.')) return;
    try {
        const batch = writeBatch(db);
        for (const {id, ...data} of window.PSY_QUESTIONS) batch.set(doc(db, QUESTIONS, id), data);
        await batch.commit();
        await fetchQuestionsFromDB();
        renderAdminList();
        alert('Đã khôi phục 200 câu theo file Word.');
    } catch (error) { alert('Chưa khôi phục được. ' + error.message); }
};
scopeSelect.onchange = () => {
    scope = scopeSelect.value;
    lsSet('scope', scope);
    window.switchMode('practice');
};
autoNext.onchange = () => {
    clearTimeout(advanceTimeout);
    lsSet('autoNext', autoNext.checked);
};
jumpInput.onkeydown = e => { if (e.key === 'Enter') window.jumpToQuestion(); };
window.addEventListener('pagehide', () => { if (!viewingTheory) saveExamProgress(); });
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') document.querySelectorAll('.modal').forEach(m => m.style.display = 'none');
});
scope = lsGet('scope','all');
isShuffled = lsGet('shuffle', false);
autoNext.checked = lsGet('autoNext', true);
populateScope();
window.switchMode('practice');
function linkedPodcastNumber() {
    const match = location.hash.match(/^#podcast(?:-([1-9]))?$/);
    return match ? Number(match[1] || 1) : undefined;
}
function openLinkedPodcast() {
    const number = linkedPodcastNumber();
    if (number !== undefined) window.showTheory(number);
}
openLinkedPodcast();
window.addEventListener('hashchange', openLinkedPodcast);
connectFirebase();
