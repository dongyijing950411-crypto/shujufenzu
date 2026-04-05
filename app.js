const CITIES_DATA = [
    { city: '北京', value: 585 },
    { city: '上海', value: 1166 },
    { city: '广州', value: 1736 },
    { city: '成都', value: 918 },
    { city: '哈尔滨', value: 524 },
    { city: '昆明', value: 1012 },
    { city: '西安', value: 553 },
    { city: '武汉', value: 1269 },
    { city: '拉萨', value: 426 },
    { city: '杭州', value: 1454 }
];

const SORTED_DATA = [...CITIES_DATA].sort((a, b) => a.value - b.value);

const TEACHER_PASSWORD = 'teacher123';

const METRICS = {
    ssd: {
        name: '离差平方和',
        desc: '衡量数据与均值偏离程度的总和，值越小表示数据越集中',
        calc: (indices) => {
            if (indices.length === 0) return 0;
            const vals = indices.map(i => SORTED_DATA[i].value);
            const mean = vals.reduce((s, v) => s + v, 0) / vals.length;
            return vals.reduce((s, v) => s + (v - mean) ** 2, 0);
        }
    },
    variance: {
        name: '方差',
        desc: '离差平方和除以数据个数，反映数据的平均离散程度',
        calc: (indices) => {
            if (indices.length === 0) return 0;
            return METRICS.ssd.calc(indices) / indices.length;
        }
    },
    std: {
        name: '标准差',
        desc: '方差的算术平方根，与数据同单位，便于直观理解离散程度',
        calc: (indices) => {
            if (indices.length === 0) return 0;
            return Math.sqrt(METRICS.variance.calc(indices));
        }
    },
    range: {
        name: '极差',
        desc: '最大值减最小值，只考虑两个极端值，计算简单但信息量有限',
        calc: (indices) => {
            if (indices.length === 0) return 0;
            const vals = indices.map(i => SORTED_DATA[i].value);
            return Math.max(...vals) - Math.min(...vals);
        }
    }
};

const OPTIMAL_A = [0, 1, 2, 3, 4];
const OPTIMAL_B = [5, 6, 7, 8, 9];

let currentStudent = null;
let currentMetric = 'ssd';
let groupA = [];
let groupB = [];
let unassigned = SORTED_DATA.map((d, i) => i);
let hintLevel = 0;
let taskCompleted = false;
let trialRecords = [];
let assistantOpen = false;
let unreadCount = 0;

function toggleAssistant() {
    const panel = document.getElementById('assistant-panel');
    const fab = document.getElementById('assistant-fab');
    const overlay = document.getElementById('assistant-overlay');
    assistantOpen = !assistantOpen;
    panel.classList.toggle('open', assistantOpen);
    overlay.classList.toggle('open', assistantOpen);
    fab.style.display = assistantOpen ? 'none' : '';
    if (assistantOpen) {
        unreadCount = 0;
        updateFabBadge();
        const container = document.getElementById('chat-messages');
        container.scrollTop = container.scrollHeight;
    }
}

function updateFabBadge() {
    const badge = document.getElementById('fab-badge');
    if (unreadCount > 0) {
        badge.textContent = unreadCount > 9 ? '9+' : unreadCount;
        badge.style.display = 'flex';
    } else {
        badge.style.display = 'none';
    }
}

function enterAsStudent() {
    document.getElementById('student-login-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('student-name-input').focus(), 100);
}

function enterAsTeacher() {
    document.getElementById('teacher-login-modal').classList.remove('hidden');
    setTimeout(() => document.getElementById('teacher-pwd-input').focus(), 100);
}

function confirmStudentLogin() {
    const name = document.getElementById('student-name-input').value.trim();
    if (!name) {
        document.getElementById('student-name-input').style.borderColor = 'var(--danger)';
        return;
    }
    currentStudent = name;
    closeModal('student-login-modal');
    document.getElementById('role-selector').classList.add('hidden');
    document.getElementById('student-view').classList.remove('hidden');
    window.addEventListener('message', handleIframeMessage);
}

function confirmTeacherLogin() {
    const pwd = document.getElementById('teacher-pwd-input').value;
    if (pwd !== TEACHER_PASSWORD) {
        document.getElementById('teacher-pwd-input').style.borderColor = 'var(--danger)';
        return;
    }
    closeModal('teacher-login-modal');
    document.getElementById('role-selector').classList.add('hidden');
    document.getElementById('teacher-view').classList.remove('hidden');
    loadTeacherData();
}

function closeModal(id) {
    document.getElementById(id).classList.add('hidden');
}

function selectMetric(metric) {
    currentMetric = metric;
    document.querySelectorAll('.metric-btn').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.metric === metric);
    });
    document.getElementById('metric-desc').textContent = METRICS[metric].desc;
    updateResultLabels();
    updateStats();
}

function updateResultLabels() {
    const name = METRICS[currentMetric].name;
    document.getElementById('label-a').textContent = `第一组${name}：`;
    document.getElementById('label-b').textContent = `第二组${name}：`;
    document.getElementById('label-total').textContent = `${name}之和：`;
}

function initDataDisplay() {
    const container = document.getElementById('data-display');
    container.innerHTML = '';
    SORTED_DATA.forEach((d, i) => {
        container.appendChild(createDataElement(i, ''));
    });
    setupDropZones();
    updateStats();
    drawNumberLine();
}

function setupDropZones() {
    ['group-a-items', 'group-b-items', 'data-display'].forEach(zoneId => {
        const zone = document.getElementById(zoneId);
        zone.ondragover = (e) => {
            e.preventDefault();
            zone.parentElement.classList.add('drag-over');
        };
        zone.ondragleave = () => {
            zone.parentElement.classList.remove('drag-over');
        };
        zone.ondrop = (e) => {
            e.preventDefault();
            zone.parentElement.classList.remove('drag-over');
            const index = parseInt(e.dataTransfer.getData('text/plain'));
            if (zoneId === 'group-a-items') moveToGroup(index, 'a');
            else if (zoneId === 'group-b-items') moveToGroup(index, 'b');
            else moveToGroup(index, 'unassigned');
        };
    });
}

function toggleDataItem(index) {
    if (unassigned.includes(index)) {
        if (groupA.length <= groupB.length) {
            moveToGroup(index, 'a');
        } else {
            moveToGroup(index, 'b');
        }
    } else if (groupA.includes(index)) {
        moveToGroup(index, 'unassigned');
    } else if (groupB.includes(index)) {
        moveToGroup(index, 'unassigned');
    }
}

function moveToGroup(index, target) {
    groupA = groupA.filter(i => i !== index);
    groupB = groupB.filter(i => i !== index);
    unassigned = unassigned.filter(i => i !== index);

    if (target === 'a') groupA.push(index);
    else if (target === 'b') groupB.push(index);
    else unassigned.push(index);

    groupA.sort((a, b) => a - b);
    groupB.sort((a, b) => a - b);
    unassigned.sort((a, b) => a - b);

    renderGroups();
    updateStats();
    drawNumberLine();
}

function renderGroups() {
    const dataDisplay = document.getElementById('data-display');
    const groupAItems = document.getElementById('group-a-items');
    const groupBItems = document.getElementById('group-b-items');

    dataDisplay.innerHTML = '';
    groupAItems.innerHTML = '';
    groupBItems.innerHTML = '';

    unassigned.forEach(i => {
        dataDisplay.appendChild(createDataElement(i, ''));
    });
    groupA.forEach(i => {
        groupAItems.appendChild(createDataElement(i, 'in-group-a'));
    });
    groupB.forEach(i => {
        groupBItems.appendChild(createDataElement(i, 'in-group-b'));
    });
}

function createDataElement(index, extraClass) {
    const item = document.createElement('div');
    item.className = `data-item ${extraClass}`;
    item.textContent = `${SORTED_DATA[index].city}(${SORTED_DATA[index].value})`;
    item.dataset.index = index;
    item.onclick = () => toggleDataItem(index);
    item.draggable = true;
    item.ondragstart = (e) => {
        e.dataTransfer.setData('text/plain', index);
        item.style.opacity = '0.5';
    };
    item.ondragend = () => {
        item.style.opacity = '1';
    };
    return item;
}

function calculateMean(indices) {
    if (indices.length === 0) return '-';
    const values = indices.map(i => SORTED_DATA[i].value);
    return (values.reduce((s, v) => s + v, 0) / values.length).toFixed(1);
}

function updateStats() {
    const calc = METRICS[currentMetric].calc;
    const valA = calc(groupA);
    const valB = calc(groupB);
    const total = valA + valB;

    document.getElementById('ssd-a').textContent = groupA.length > 0 ? valA.toFixed(1) : '-';
    document.getElementById('ssd-b').textContent = groupB.length > 0 ? valB.toFixed(1) : '-';
    document.getElementById('ssd-total').textContent = (groupA.length > 0 && groupB.length > 0) ? total.toFixed(1) : '-';
    document.getElementById('mean-a').textContent = calculateMean(groupA);
    document.getElementById('mean-b').textContent = calculateMean(groupB);

    document.getElementById('group-a-stats').textContent = groupA.length > 0 ? `均值: ${calculateMean(groupA)} mm` : '';
    document.getElementById('group-b-stats').textContent = groupB.length > 0 ? `均值: ${calculateMean(groupB)} mm` : '';
}

function drawNumberLine() {
    const canvas = document.getElementById('number-line-canvas');
    const container = document.getElementById('number-line-container');
    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width - 20;
    const h = 120;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, w, h);

    const minVal = 300;
    const maxVal = 1900;
    const padL = 50;
    const padR = 30;
    const lineY = 55;
    const usableW = w - padL - padR;

    function valToX(v) {
        return padL + ((v - minVal) / (maxVal - minVal)) * usableW;
    }

    ctx.strokeStyle = '#d1d5db';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(padL, lineY);
    ctx.lineTo(w - padR, lineY);
    ctx.stroke();

    ctx.fillStyle = '#9ca3af';
    ctx.strokeStyle = '#9ca3af';
    ctx.lineWidth = 1;
    [400, 600, 800, 1000, 1200, 1400, 1600, 1800].forEach(tick => {
        const x = valToX(tick);
        ctx.beginPath();
        ctx.moveTo(x, lineY - 6);
        ctx.lineTo(x, lineY + 6);
        ctx.stroke();
        ctx.font = '11px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText(tick, x, lineY + 20);
    });

    ctx.font = '11px sans-serif';
    ctx.fillStyle = '#6b7280';
    ctx.textAlign = 'center';
    ctx.fillText('降水量 (mm)', w / 2, h - 4);

    const groupASet = new Set(groupA);
    const groupBSet = new Set(groupB);

    const colors = {
        a: '#22c55e',
        b: '#f59e0b',
        un: '#9ca3af'
    };

    const dotY = [lineY - 22, lineY + 32];

    SORTED_DATA.forEach((d, i) => {
        const x = valToX(d.value);
        let color, y;

        if (groupASet.has(i)) {
            color = colors.a;
            y = dotY[0];
        } else if (groupBSet.has(i)) {
            color = colors.b;
            y = dotY[1];
        } else {
            color = colors.un;
            y = lineY;
        }

        ctx.beginPath();
        ctx.arc(x, y, 7, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();
        ctx.strokeStyle = 'white';
        ctx.lineWidth = 2;
        ctx.stroke();

        ctx.font = 'bold 10px sans-serif';
        ctx.fillStyle = '#374151';
        ctx.textAlign = 'center';
        const labelY = groupASet.has(i) ? y - 14 : groupBSet.has(i) ? y + 18 : y - 14;
        ctx.fillText(d.city, x, labelY);
        ctx.font = '9px sans-serif';
        ctx.fillStyle = '#6b7280';
        ctx.fillText(d.value, x, labelY + 11);
    });
}

function recordAndCheck() {
    const feedback = document.getElementById('feedback');

    if (groupA.length === 0 || groupB.length === 0) {
        feedback.className = 'feedback error';
        feedback.textContent = '⚠️ 两组都需要至少有一个城市哦！请把所有城市分到两组中。';
        feedback.classList.remove('hidden');
        return;
    }

    if (unassigned.length > 0) {
        feedback.className = 'feedback error';
        feedback.textContent = `⚠️ 还有 ${unassigned.length} 个城市没有分组，请把所有城市都分到两组中。`;
        feedback.classList.remove('hidden');
        return;
    }

    const calc = METRICS[currentMetric].calc;
    const valA = calc(groupA);
    const valB = calc(groupB);
    const total = valA + valB;

    const optimalVal = calc(OPTIMAL_A) + calc(OPTIMAL_B);
    const isOptimal = Math.abs(total - optimalVal) < 0.1;

    const record = {
        id: trialRecords.length + 1,
        metric: currentMetric,
        metricName: METRICS[currentMetric].name,
        groupA: [...groupA],
        groupB: [...groupB],
        groupACities: groupA.map(i => SORTED_DATA[i].city).join('、'),
        groupBCities: groupB.map(i => SORTED_DATA[i].city).join('、'),
        valA: valA.toFixed(1),
        valB: valB.toFixed(1),
        total: total.toFixed(1),
        isOptimal: isOptimal
    };

    trialRecords.push(record);
    renderTrialTable();
    saveTrialRecord(record);

    if (isOptimal) {
        feedback.className = 'feedback success';
        feedback.innerHTML = `🎉 太棒了！使用<strong>${record.metricName}</strong>找到了最优分组方案！<br>${record.metricName}之和为 <strong>${total.toFixed(1)}</strong>。<br>第一组（${record.groupACities}）—— 干旱/半干旱地区<br>第二组（${record.groupBCities}）—— 湿润/半湿润地区`;
        feedback.classList.remove('hidden');
        if (!taskCompleted) {
            taskCompleted = true;
            saveCompletion(currentStudent, true, currentMetric);
            addAssistantMessage(`🎉 太厉害了！你用${record.metricName}找到了最优分组！\n\n你有没有想过：如果换一种统计量（比如极差），还能找到同样的最优分组吗？试试切换统计量看看结果会不会变化？这能帮你理解不同统计量在分组中的不同作用 😊`);
        }
    } else {
        const diff = ((total - optimalVal) / optimalVal * 100).toFixed(1);
        feedback.className = 'feedback info';
        feedback.innerHTML = `🤔 使用<strong>${record.metricName}</strong>，当前${record.metricName}之和为 <strong>${total.toFixed(1)}</strong>，比最优值大了 ${diff}%。<br>试着调整分组，看看能不能让这个值更小？<br>也可以试试切换到其他统计量，对比一下不同统计量下的分组结果！`;
        feedback.classList.remove('hidden');
    }
}

function renderTrialTable() {
    const tbody = document.getElementById('trial-tbody');

    if (trialRecords.length === 0) {
        tbody.innerHTML = '<tr class="empty-row"><td colspan="8" class="empty-hint">还没有尝试记录，完成分组后点击"记录并检查"来保存你的尝试</td></tr>';
        return;
    }

    const bestTotal = Math.min(...trialRecords.map(r => parseFloat(r.total)));

    tbody.innerHTML = trialRecords.map(r => {
        const isBest = parseFloat(r.total) === bestTotal;
        const rowClass = isBest ? 'trial-best' : '';
        let evalBadge;
        if (r.isOptimal) {
            evalBadge = '<span class="eval-badge best">✅ 最优</span>';
        } else if (parseFloat(r.total) <= bestTotal * 1.1) {
            evalBadge = '<span class="eval-badge good">👍 接近</span>';
        } else {
            evalBadge = '<span class="eval-badge try-again">🔄 可优化</span>';
        }

        return `
            <tr class="${rowClass}">
                <td>${r.id}</td>
                <td>${r.metricName}</td>
                <td class="cities-cell">${escapeHtml(r.groupACities)}</td>
                <td class="cities-cell">${escapeHtml(r.groupBCities)}</td>
                <td>${r.valA}</td>
                <td>${r.valB}</td>
                <td><strong>${r.total}</strong></td>
                <td>${evalBadge}</td>
            </tr>
        `;
    }).join('');
}

function resetGrouping() {
    groupA = [];
    groupB = [];
    unassigned = SORTED_DATA.map((d, i) => i);
    hintLevel = 0;
    renderGroups();
    updateStats();
    initDataDisplay();
    document.getElementById('feedback').classList.add('hidden');
}

function showHint() {
    const feedback = document.getElementById('feedback');
    feedback.classList.remove('hidden');

    const metricHints = {
        ssd: [
            { type: 'info', text: '💡 提示1：先把数据从小到大排好，观察一下数据的分布特点。你注意到哪些城市降水量比较接近吗？' },
            { type: 'info', text: '💡 提示2：离差平方和衡量的是一组数据内部各数据与均值的偏离程度。怎样分组才能让每组内部的数据尽量接近？' },
            { type: 'info', text: '💡 提示3：试着找到数据中的一个"分界点"，使得分界点左边的数据彼此接近，右边的数据也彼此接近。' },
            { type: 'info', text: '💡 提示4：拉萨(426)、哈尔滨(524)、西安(553)、北京(585) 这些城市的降水量比较接近，它们可能应该在同一组。' },
            { type: 'info', text: '💡 提示5：最优分组是：{拉萨426, 哈尔滨524, 西安553, 北京585, 成都918} 和 {昆明1012, 上海1166, 武汉1269, 杭州1454, 广州1736}。试着验证一下！' }
        ],
        variance: [
            { type: 'info', text: '💡 提示1：方差 = 离差平方和 ÷ 数据个数。它和离差平方和有什么关系？用方差分组和用离差平方和分组，结果会一样吗？' },
            { type: 'info', text: '💡 提示2：因为两组的数据个数可能不同，方差和离差平方和找到的"最优分组"可能会不一样哦！试试看？' },
            { type: 'info', text: '💡 提示3：先试着用离差平方和找到最优分组，然后切换到方差看看，结果变了吗？想想为什么？' }
        ],
        std: [
            { type: 'info', text: '💡 提示1：标准差 = 方差的算术平方根。它和方差找到的最优分组是一样的，因为开方不改变大小关系。' },
            { type: 'info', text: '💡 提示2：标准差的优点是和原始数据单位相同（都是mm），更容易直观理解。试试对比标准差和极差的结果。' }
        ],
        range: [
            { type: 'info', text: '💡 提示1：极差 = 最大值 - 最小值。它只看两个极端值，你觉得用极差来衡量分组好坏有什么局限性？' },
            { type: 'info', text: '💡 提示2：极差只考虑最大值和最小值，忽略了中间数据的分布。比如 {100, 500, 500} 和 {100, 300, 700} 极差相同，但分散程度一样吗？' },
            { type: 'info', text: '💡 提示3：试试用极差找到"最优"分组，然后切换到离差平方和对比一下。你会发现什么？' }
        ]
    };

    const hints = metricHints[currentMetric] || metricHints.ssd;

    if (hintLevel < hints.length) {
        const hint = hints[hintLevel];
        feedback.className = `feedback ${hint.type}`;
        feedback.textContent = hint.text;
        hintLevel++;
    } else {
        feedback.className = 'feedback info';
        feedback.textContent = '💡 已经没有更多提示了，试着按照之前的提示自己动手操作吧！也可以切换到其他统计量对比看看。';
    }
}

function handleChatKeypress(event) {
    if (event.key === 'Enter') {
        sendMessage();
    }
}

const DEEPSEEK_API_URL = 'https://api.deepseek.com/chat/completions';

const ASSISTANT_SYSTEM_PROMPT = `你是一位温柔、亲切、有耐心的初中数学老师，正在上一堂关于"数据的分组"的公开课。你的角色是AI助教，引导学生进行探究式学习。

## 你的核心身份
- 你说话温柔友好，像大姐姐/大哥哥一样鼓励学生
- 你使用适合初中生的语言，避免过于复杂的术语
- 你通过提问引导学生独立思考，而不是直接给出答案

## 教学内容背景
- 课题：数据的分组——用数学之尺，量地理之线
- 学生需要将一组地理数据（如年平均降水量）分成两组
- 学生可以使用不同的统计量来衡量分组的好坏：离差平方和、方差、标准差、极差
- 三个探究模块：数据分析（散点图）、模型建立（分组方法）、模型求解（地理分界线）

## 你的教学原则
1. **一次只给一步提示**：绝不直接给出完整答案
2. **用问题引导**：通过开放式问题引导学生自己发现答案
3. **渐进式提示**：从宽泛的提示开始，根据学生困惑程度逐渐具体
4. **联系实际**：将引导与地理气候背景联系起来
5. **鼓励为主**：肯定学生的每一步进展

## 回答格式
- 回答要简洁，每次不超过3-4句话
- 适当使用emoji让语气更亲切
- 如果学生问与课堂无关的问题，温和地引导回当前活动
- 如果学生直接要答案，用一个引导性问题回应

## 知识点参考
- 离差平方和 S = Σ(xᵢ - x̄)²，衡量数据与均值偏离程度的总和
- 方差 s² = S/n，离差平方和除以数据个数
- 标准差 s = √s²，与原数据同单位
- 极差 R = 最大值 - 最小值，只考虑两个极端值
- 分组目标：让组内数据尽量集中（统计量之和最小），组间尽量分开`;

const DEFAULT_API_KEY = 'sk-32177dc1fde841758a28dda55024cc7a';

let chatHistory = [];

function getApiKey() {
    return localStorage.getItem('deepseek_api_key') || DEFAULT_API_KEY;
}

function sendMessage() {
    const input = document.getElementById('chat-input');
    const text = input.value.trim();
    if (!text) return;

    addStudentMessage(text);
    input.value = '';

    callDeepSeekAPI(text);
}

async function callDeepSeekAPI(userMessage) {
    chatHistory.push({ role: 'user', content: userMessage });
    const loadingMsg = addLoadingMessage();

    try {
        const res = await fetch(DEEPSEEK_API_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${getApiKey()}`
            },
            body: JSON.stringify({
                model: 'deepseek-chat',
                messages: [
                    { role: 'system', content: ASSISTANT_SYSTEM_PROMPT },
                    ...chatHistory.slice(-10)
                ],
                temperature: 0.7,
                max_tokens: 300
            })
        });

        if (!res.ok) {
            throw new Error(`API请求失败: ${res.status}`);
        }

        const data = await res.json();
        const reply = data.choices[0].message.content;
        chatHistory.push({ role: 'assistant', content: reply });

        removeLoadingMessage(loadingMsg);
        addAssistantMessage(reply);
        saveQuestionRecord(currentStudent, userMessage, reply, 'AI对话');
    } catch (err) {
        removeLoadingMessage(loadingMsg);
        const fallback = generateAssistantResponse(userMessage);
        addAssistantMessage(fallback.reply + '\n\n（⚠️ AI服务暂时不可用，以上为预设回复）');
        saveQuestionRecord(currentStudent, userMessage, fallback.reply, fallback.topic);
    }
}

function addLoadingMessage() {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message assistant-msg loading-msg';
    msg.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-content"><p class="typing-indicator"><span></span><span></span><span></span></p></div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    return msg;
}

function removeLoadingMessage(msg) {
    if (msg && msg.parentNode) {
        msg.parentNode.removeChild(msg);
    }
}

function openApiKeySettings() {
    const savedKey = localStorage.getItem('deepseek_api_key');
    const input = document.getElementById('apikey-input');
    const status = document.getElementById('apikey-status');

    input.style.display = '';
    document.querySelector('.apikey-hint').style.display = '';
    document.querySelector('#apikey-modal .modal-actions .btn-primary').style.display = '';
    document.querySelector('#apikey-modal .modal-actions .btn-danger').style.display = '';

    if (savedKey) {
        input.value = savedKey;
        status.innerHTML = '<span style="color:#22c55e;">✅ 已配置自定义 API Key（覆盖默认Key）</span>';
    } else {
        input.value = '';
        status.innerHTML = '<span style="color:#22c55e;">✅ 已内置默认 API Key，可直接使用</span><br><span style="font-size:12px;color:#64748b;">如需更换，输入新的 Key 保存即可覆盖</span>';
    }

    document.getElementById('apikey-modal').classList.remove('hidden');
}

function saveApiKey() {
    const key = document.getElementById('apikey-input').value.trim();
    if (!key) {
        document.getElementById('apikey-status').innerHTML = '<span style="color:#ef4444;">❌ 请输入 API Key</span>';
        return;
    }
    localStorage.setItem('deepseek_api_key', key);
    document.getElementById('apikey-status').innerHTML = '<span style="color:#22c55e;">✅ API Key 已保存</span>';
    chatHistory = [];
    setTimeout(() => closeModal('apikey-modal'), 1000);
}

function clearApiKey() {
    localStorage.removeItem('deepseek_api_key');
    document.getElementById('apikey-input').value = '';
    document.getElementById('apikey-status').innerHTML = '<span style="color:#f59e0b;">⚠️ 已清除，AI助教将使用预设回复</span>';
    chatHistory = [];
}

function addStudentMessage(text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message student-msg';
    msg.innerHTML = `
        <div class="msg-avatar">🙋</div>
        <div class="msg-content"><p>${escapeHtml(text)}</p></div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
}

function addAssistantMessage(text) {
    const container = document.getElementById('chat-messages');
    const msg = document.createElement('div');
    msg.className = 'message assistant-msg';
    msg.innerHTML = `
        <div class="msg-avatar">🤖</div>
        <div class="msg-content"><p>${text}</p></div>
    `;
    container.appendChild(msg);
    container.scrollTop = container.scrollHeight;
    if (!assistantOpen && window.innerWidth <= 1024) {
        unreadCount++;
        updateFabBadge();
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateAssistantResponse(question) {
    const q = question.toLowerCase();

    const rules = [
        {
            keywords: ['什么是', '什么是离差', '离差平方和是什么', '什么意思', '啥意思', '啥是', '解释一下', '解释下'],
            topic: '离差平方和概念',
            reply: '好问题！我们先来想想"离差"是什么——离差就是一个数据与这组数据的均值之间的差。那"离差平方和"呢？就是把每个数据的离差平方后加起来。它衡量的是一组数据"分散"的程度——离差平方和越大，说明数据越分散；越小，说明数据越集中。你能想到为什么我们要用"平方"而不是直接求和吗？😊'
        },
        {
            keywords: ['为什么平方', '为什么不直接', '直接求和', '不用绝对值', '为什么用平方'],
            topic: '离差平方和原理',
            reply: '这个问题问得特别好！你想想看，如果直接把离差加起来会怎样？正的离差和负的离差会互相抵消，对吧？那用绝对值呢？其实也可以，但平方有一个好处——它对偏离均值越远的数据"惩罚"更大，这样能更好地反映数据的分散程度。你觉得这个解释有道理吗？'
        },
        {
            keywords: ['方差是什么', '什么是方差', '方差怎么算', '方差和离差'],
            topic: '方差概念',
            reply: '方差其实和离差平方和关系很密切！方差 = 离差平方和 ÷ 数据个数。你可以把它理解为"平均每个数据偏离均值多少的平方"。因为除以了数据个数，所以它不受数据量多少的影响。你试试切换到"方差"统计量，看看和离差平方和的结果有什么不同？'
        },
        {
            keywords: ['标准差是什么', '什么是标准差', '标准差怎么算', '标准差和方差'],
            topic: '标准差概念',
            reply: '标准差就是方差的算术平方根！它的好处是和原始数据的单位相同——这里都是mm，所以更容易直观理解。比如标准差是200mm，就意味着数据平均偏离均值约200mm。你可以在页面上切换到"标准差"试试看！'
        },
        {
            keywords: ['极差是什么', '什么是极差', '极差怎么算', '极差有什么问题', '极差的局限'],
            topic: '极差概念',
            reply: '极差 = 最大值 - 最小值，是最简单的衡量数据分散程度的方法。但你觉得它有什么不足吗？它只考虑了最大和最小两个值，中间的数据分布完全被忽略了。比如一组数据是{100, 500, 500}，另一组是{100, 300, 700}，它们的极差都是400，但分散程度一样吗？你可以用极差和离差平方和分别分组，对比一下结果！'
        },
        {
            keywords: ['哪个好', '用哪个', '选哪个', '哪个统计量', '区别', '不同', '对比', '比较统计量', '哪个更合适'],
            topic: '统计量对比',
            reply: '这个问题非常有价值！我建议你亲自来对比——先用离差平方和找到最优分组，记录下来；然后切换到方差、标准差、极差，分别再找最优分组。把结果都记录在"分组尝试记录"表格里，对比一下它们的分组方案和统计量值。你发现了什么规律？哪种统计量更能反映数据的真实分组情况？'
        },
        {
            keywords: ['怎么分', '如何分', '怎么分组', '从哪里开始', '不知道', '不会', '怎么做', '无从下手', '没思路'],
            topic: '分组方法',
            reply: '别着急，我们一步步来！首先，你观察一下这10个城市的降水量数据，它们是从小到大排好的。你能不能先看看这些数据大致的分布情况？有没有发现某些城市的降水量比较接近，可以归为一类？先凭直觉分分看，然后提交记录，看看你选择的统计量值是多少。'
        },
        {
            keywords: ['均值', '平均数', '怎么算均值', '怎么求均值', '平均'],
            topic: '均值计算',
            reply: '均值就是把一组数据的所有值加起来，再除以数据的个数。比如第一组有5个城市，就把这5个降水量加起来除以5。你可以在分组面板上看到每组的均值已经帮你算好了哦！观察一下两组的均值，你发现了什么？'
        },
        {
            keywords: ['最优', '最小', '最合理', '最好', '正确答案', '答案是什么', '对不对'],
            topic: '最优分组判断',
            reply: '嗯，我不直接告诉你答案哦~ 但是我可以告诉你一个方法：数据已经从小到大排好了，最优的分界点只需要在相邻两个城市之间找。你可以试试不同的切分位置，每次都算一下统计量之和，看看哪个位置的和最小。多试几次，记录下来对比！'
        },
        {
            keywords: ['分界点', '在哪里分', '从哪个城市', '怎么切', '切在哪里', '断点'],
            topic: '分界点确定',
            reply: '很好的思路！既然数据已经排好序了，我们只需要找到一个"切分点"。你可以试试不同的切分位置，每次都算一下两组的统计量之和，看看哪个位置的和最小。试试从第1个城市后面切、第2个后面切……一直到第9个后面，比较一下结果。别忘了把每次尝试都记录下来哦！'
        },
        {
            keywords: ['干旱', '湿润', '气候', '地理', '降水', '降雨', '地区'],
            topic: '地理背景',
            reply: '没错！这就是这个问题的地理背景。降水量是划分气候类型的重要指标。一般来说，年降水量少于400mm的地区比较干旱，400-800mm是半干旱，800-1600mm是半湿润到湿润，超过1600mm就是非常湿润了。你看看这些城市的数据，能不能从地理角度理解为什么要这样分组？'
        },
        {
            keywords: ['公式', '计算', '怎么算', '算式', '步骤'],
            topic: '计算方法',
            reply: '离差平方和的计算步骤：第一步，算出均值；第二步，算每个数据与均值的差（离差）；第三步，把每个离差平方；第四步，把所有平方值加起来。举个例子：{426, 524, 553}，均值=(426+524+553)/3=501，离差平方和=(426-501)²+(524-501)²+(553-501)²。方差就是再除以3，标准差就是再开根号。你试着算算看？'
        },
        {
            keywords: ['两组', '为什么分两组', '分几组', '分成几组'],
            topic: '分组数量',
            reply: '好问题！今天我们练习的是分成两组的情况。分成两组是最基本的分组方式，可以帮助我们初步认识数据的分布特征。在实际情况中，数据可能需要分成更多的组，但原理是一样的——都是让组内的统计量值尽量小。你先掌握两组的情况，以后遇到多组的问题就会更容易理解了！'
        },
        {
            keywords: ['拖动', '操作', '怎么用', '怎么操作', '使用方法', '怎么玩'],
            topic: '系统操作',
            reply: '操作很简单哦！\n1. 先在上方选择一个统计量（离差平方和、方差、标准差、极差）\n2. 点击数据卡片，点击一次分到第一组，再点取消\n3. 也可以拖拽卡片到左边的"第一组"或右边的"第二组"\n4. 分好后点击"记录并检查"，结果会保存到下方的表格中\n5. 可以切换统计量，用不同标准再试一次，对比结果！'
        },
        {
            keywords: ['提交', '检查', '验证', '对不对', '我分好了', '记录'],
            topic: '结果验证',
            reply: '分好了就点"📝 记录并检查"按钮吧！系统会把你的分组方案记录到下方的表格中，方便你对比不同尝试的结果。如果统计量之和是最小的，会告诉你找到了最优方案。大胆尝试不同的分组和不同的统计量！'
        },
        {
            keywords: ['表格', '记录表', '尝试记录', '怎么记录'],
            topic: '记录表使用',
            reply: '下方的"分组尝试记录"表格会自动记录你每次提交的分组方案。你可以看到每次使用的统计量、分组情况、统计量值和评价。这样你就能方便地对比不同统计量和不同分组方案的效果了！试试用不同统计量各做一次，看看表格里有什么规律？'
        },
        {
            keywords: ['数轴', '数轴上', '图', '可视化'],
            topic: '数轴可视化',
            reply: '数轴上用绿色圆点表示第一组的城市，橙色圆点表示第二组的城市，灰色表示还没分组的城市。你可以直观地看到两组城市在降水量上的分布情况。一个好的分组方案，在数轴上应该能清楚地看到两组城市分别聚集在两个不同的区域。观察一下你的分组在数轴上的效果吧！'
        }
    ];

    for (const rule of rules) {
        if (rule.keywords.some(kw => q.includes(kw))) {
            return { reply: rule.reply, topic: rule.topic };
        }
    }

    const generalReplies = [
        { topic: '一般提问', reply: '嗯，你能主动提问很好！你可以试着问我关于"离差平方和怎么算"、"方差和离差平方和有什么区别"、"极差有什么局限性"、"怎么找到最优分组"等问题。也可以试试切换不同的统计量来对比分组效果！' },
        { topic: '一般提问', reply: '这个问题很有趣！为了更好地帮助你，你能再具体描述一下困惑的地方吗？比如是在理解某个统计量的概念、计算过程、还是分组方法上遇到了问题？' },
        { topic: '一般提问', reply: '我理解你可能有些困惑。你现在进行到哪一步了？是已经尝试过分组了，还是在选择用哪种统计量？告诉我你的进度，我可以更有针对性地帮助你。' }
    ];

    return generalReplies[Math.floor(Math.random() * generalReplies.length)];
}

function saveQuestionRecord(student, question, reply, topic) {
    const records = JSON.parse(localStorage.getItem('question_records') || '[]');
    records.push({
        id: Date.now(),
        time: new Date().toLocaleString('zh-CN'),
        student: student,
        question: question,
        reply: reply,
        topic: topic
    });
    localStorage.setItem('question_records', JSON.stringify(records));
}

function saveCompletion(student, success, metric) {
    const completions = JSON.parse(localStorage.getItem('completions') || '{}');
    if (!completions[student] || !completions[student].success) {
        completions[student] = {
            time: new Date().toLocaleString('zh-CN'),
            success: success,
            metric: metric
        };
        localStorage.setItem('completions', JSON.stringify(completions));
    }
}

function saveTrialRecord(record) {
    const key = `trials_${currentStudent}`;
    const trials = JSON.parse(localStorage.getItem(key) || '[]');
    trials.push({
        ...record,
        time: new Date().toLocaleString('zh-CN'),
        student: currentStudent
    });
    localStorage.setItem(key, JSON.stringify(trials));
}

function loadStudentTrials() {
    if (!currentStudent) return;
    const key = `trials_${currentStudent}`;
    const trials = JSON.parse(localStorage.getItem(key) || '[]');
    trialRecords = trials;
    renderTrialTable();
}

function loadTeacherData() {
    const records = JSON.parse(localStorage.getItem('question_records') || '[]');
    const completions = JSON.parse(localStorage.getItem('completions') || '{}');
    const operations = JSON.parse(localStorage.getItem('student_operations') || '[]');

    document.getElementById('stat-total').textContent = records.length;

    const uniqueStudents = new Set(records.map(r => r.student));
    operations.forEach(o => uniqueStudents.add(o.student));
    document.getElementById('stat-students').textContent = uniqueStudents.size;

    let totalTrials = 0;
    const metricCounts = { ssd: 0, variance: 0, std: 0, range: 0 };
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('trials_')) {
            const trials = JSON.parse(localStorage.getItem(k) || '[]');
            totalTrials += trials.length;
            trials.forEach(t => {
                if (metricCounts.hasOwnProperty(t.metric)) {
                    metricCounts[t.metric]++;
                }
            });
        }
    }
    totalTrials += operations.length;
    document.getElementById('stat-trials').textContent = totalTrials;

    const topics = new Set(records.map(r => r.topic));
    operations.forEach(o => topics.add(o.module));
    document.getElementById('stat-topics').textContent = topics.size;

    renderTopicList(records);
    renderMetricDistribution(metricCounts, totalTrials);
    renderRecordsTable(records);
    renderCompletionList(completions);
    renderTopicFilter(records);
    renderOperationsList(operations);
}

function renderTopicList(records) {
    const topicCounts = {};
    records.forEach(r => {
        topicCounts[r.topic] = (topicCounts[r.topic] || 0) + 1;
    });

    const sorted = Object.entries(topicCounts).sort((a, b) => b[1] - a[1]);
    const container = document.getElementById('topic-list');

    if (sorted.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>暂无提问记录</p></div>';
        return;
    }

    container.innerHTML = sorted.slice(0, 10).map(([topic, count], i) => {
        const rankClass = i === 0 ? 'r1' : i === 1 ? 'r2' : i === 2 ? 'r3' : 'rn';
        return `
            <div class="topic-item">
                <div class="topic-rank ${rankClass}">${i + 1}</div>
                <div class="topic-text">${topic}</div>
                <div class="topic-count">${count}次</div>
            </div>
        `;
    }).join('');
}

function renderMetricDistribution(metricCounts, total) {
    const container = document.getElementById('metric-distribution');
    const colors = { ssd: '#4f6ef7', variance: '#22c55e', std: '#f59e0b', range: '#ef4444' };

    if (total === 0) {
        container.innerHTML = '<div class="empty-state"><p>暂无分组尝试数据</p></div>';
        return;
    }

    container.innerHTML = Object.entries(METRICS).map(([key, m]) => {
        const count = metricCounts[key] || 0;
        const pct = total > 0 ? (count / total * 100) : 0;
        return `
            <div class="metric-dist-card">
                <div class="dist-name">${m.name}</div>
                <div class="dist-bar-bg">
                    <div class="dist-bar" style="width:${pct}%; background:${colors[key]}"></div>
                </div>
                <div class="dist-count">${count}次 (${pct.toFixed(1)}%)</div>
            </div>
        `;
    }).join('');
}

function renderRecordsTable(records) {
    const tbody = document.getElementById('records-tbody');
    const sorted = [...records].reverse();

    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" class="empty-state">暂无提问记录</td></tr>';
        return;
    }

    tbody.innerHTML = sorted.map(r => `
        <tr>
            <td>${r.time}</td>
            <td>${escapeHtml(r.student)}</td>
            <td class="question-cell">${escapeHtml(r.question)}</td>
            <td><span class="eval-badge good">${escapeHtml(r.topic)}</span></td>
            <td class="reply-cell">${escapeHtml(r.reply)}</td>
        </tr>
    `).join('');
}

function renderCompletionList(completions) {
    const container = document.getElementById('completion-list');
    const entries = Object.entries(completions);

    if (entries.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>暂无学生完成记录</p></div>';
        return;
    }

    container.innerHTML = entries.map(([name, data]) => `
        <div class="completion-item">
            <div class="completion-avatar">${name.charAt(0)}</div>
            <div class="completion-info">
                <div class="completion-name">${escapeHtml(name)}</div>
                <div class="completion-status ${data.success ? 'done' : ''}">${data.success ? `✅ 已完成 (${METRICS[data.metric]?.name || data.metric})` : '⏳ 进行中'}</div>
            </div>
        </div>
    `).join('');
}

function renderTopicFilter(records) {
    const topics = new Set(records.map(r => r.topic));
    const select = document.getElementById('filter-topic');
    select.innerHTML = '<option value="">全部知识点</option>';
    topics.forEach(t => {
        select.innerHTML += `<option value="${t}">${t}</option>`;
    });
}

function filterRecords() {
    const studentFilter = document.getElementById('filter-student').value.toLowerCase();
    const topicFilter = document.getElementById('filter-topic').value;
    const records = JSON.parse(localStorage.getItem('question_records') || '[]');

    const filtered = records.filter(r => {
        const matchStudent = !studentFilter || r.student.toLowerCase().includes(studentFilter);
        const matchTopic = !topicFilter || r.topic === topicFilter;
        return matchStudent && matchTopic;
    });

    renderRecordsTable(filtered);
}

function exportData() {
    const records = JSON.parse(localStorage.getItem('question_records') || '[]');
    const completions = JSON.parse(localStorage.getItem('completions') || '{}');
    const operations = JSON.parse(localStorage.getItem('student_operations') || '[]');

    const allTrials = {};
    for (let i = 0; i < localStorage.length; i++) {
        const k = localStorage.key(i);
        if (k.startsWith('trials_')) {
            allTrials[k] = JSON.parse(localStorage.getItem(k) || '[]');
        }
    }

    const data = {
        exportTime: new Date().toLocaleString('zh-CN'),
        totalQuestions: records.length,
        totalStudents: new Set([...records.map(r => r.student), ...operations.map(o => o.student)]).size,
        totalOperations: operations.length,
        totalTrials: Object.values(allTrials).reduce((sum, trials) => sum + trials.length, 0),
        completions: completions,
        questionRecords: records,
        operationRecords: operations,
        trialRecords: allTrials
    };

    openExportOptions(data);
}

let exportDataCache = null;
let selectedExportFormat = 'json';

function openExportOptions(data) {
    exportDataCache = data;
    selectedExportFormat = 'json';
    
    const modal = document.createElement('div');
    modal.className = 'modal';
    modal.innerHTML = `
        <div class="modal-content" style="max-width: 400px;">
            <h2>📥 导出数据</h2>
            <p>选择导出格式：</p>
            <div style="display: flex; gap: 20px; justify-content: center; margin: 20px 0;">
                <button class="btn btn-primary format-btn" onclick="selectExportFormat('json')" style="border: 2px solid #0277bd;"><span style="margin-right: 8px;">📄</span> JSON 格式</button>
                <button class="btn btn-secondary format-btn" onclick="selectExportFormat('csv')" style="border: 2px solid transparent;"><span style="margin-right: 8px;">📊</span> CSV 格式</button>
            </div>
            <p style="font-size: 12px; color: #64748b; text-align: center;">
                JSON：包含完整原始数据<br>
                CSV：适合在 Excel 中查看和分析
            </p>
            <div class="modal-actions" style="margin-top: 20px;">
                <button class="btn btn-primary" onclick="confirmExport()" style="margin-right: 10px;">导出</button>
                <button class="btn btn-secondary" onclick="this.closest('.modal').remove(); exportDataCache = null; selectedExportFormat = 'json';">取消</button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

function selectExportFormat(format) {
    selectedExportFormat = format;
    const buttons = document.querySelectorAll('.format-btn');
    buttons.forEach(btn => {
        if (btn.onclick.toString().includes(`'${format}'`)) {
            btn.style.border = '2px solid #0277bd';
            btn.style.backgroundColor = format === 'json' ? '#0277bd' : '#64748b';
            btn.style.color = '#fff';
        } else {
            btn.style.border = '2px solid transparent';
            btn.style.backgroundColor = '';
            btn.style.color = '';
        }
    });
}

function confirmExport() {
    if (!exportDataCache) return;
    
    if (selectedExportFormat === 'json') {
        exportAsJSON();
    } else {
        exportAsCSV();
    }
}

function exportAsJSON() {
    if (!exportDataCache) return;
    const data = exportDataCache;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `学情分析_${new Date().toLocaleDateString('zh-CN')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    document.querySelector('.modal').remove();
    exportDataCache = null;
}

function exportAsCSV() {
    if (!exportDataCache) return;
    const data = exportDataCache;
    const csvContent = generateCSV(data);
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `学情分析_${new Date().toLocaleDateString('zh-CN')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    document.querySelector('.modal').remove();
    exportDataCache = null;
}

function generateCSV(data) {
    let csv = '';

    // 表头
    csv += '数据类型,学生,时间,内容,模块,详情\n';

    // 问题记录
    data.questionRecords.forEach(record => {
        csv += `问题,${record.student},${new Date(record.timestamp).toLocaleString('zh-CN')},${escapeCSV(record.question)},${record.topic || ''},${escapeCSV(record.reply)}\n`;
    });

    // 操作记录
    data.operationRecords.forEach(op => {
        csv += `操作,${op.student},${new Date(op.timestamp).toLocaleString('zh-CN')},${op.type},${op.module || ''},${escapeCSV(op.detail || '')}\n`;
    });

    // 分组尝试记录
    Object.entries(data.trialRecords).forEach(([key, trials]) => {
        const student = key.replace('trials_', '');
        trials.forEach(trial => {
            const statValue = trial.value || trial.total || 'N/A';
            csv += `分组尝试,${student},${new Date(trial.timestamp).toLocaleString('zh-CN')},${trial.metric},${trial.module || ''},${statValue}\n`;
        });
    });

    return csv;
}

function escapeCSV(value) {
    if (value === null || value === undefined) return '';
    const str = String(value);
    if (str.includes(',') || str.includes('\n') || str.includes('"')) {
        return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
}

function clearAllData() {
    if (confirm('确定要清空所有学情数据吗？此操作不可恢复！')) {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const k = localStorage.key(i);
            if (k === 'question_records' || k === 'completions' || k.startsWith('trials_')) {
                keysToRemove.push(k);
            }
        }
        keysToRemove.forEach(k => localStorage.removeItem(k));
        loadTeacherData();
    }
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
        if (!document.getElementById('student-login-modal').classList.contains('hidden')) {
            confirmStudentLogin();
        } else if (!document.getElementById('teacher-login-modal').classList.contains('hidden')) {
            confirmTeacherLogin();
        }
    }
});

window.addEventListener('resize', () => {
    if (!document.getElementById('student-view').classList.contains('hidden')) {
        drawNumberLine();
    }
});

function handleIframeMessage(event) {
    if (!currentStudent) return;
    const data = event.data;
    if (!data || !data.type) return;

    const storageKey = 'student_operations';
    const operations = JSON.parse(localStorage.getItem(storageKey) || '[]');

    const record = {
        student: currentStudent,
        type: data.type,
        detail: data.detail || '',
        timestamp: new Date().toISOString(),
        module: data.module || ''
    };

    operations.push(record);
    localStorage.setItem(storageKey, JSON.stringify(operations));
}

function renderOperationsList(operations) {
    const container = document.getElementById('operations-list');
    if (!container) return;

    if (operations.length === 0) {
        container.innerHTML = '<div class="empty-state"><div class="empty-icon">📭</div><p>暂无操作记录</p></div>';
        return;
    }

    const typeLabels = {
        'import_data': '📂 导入数据',
        'confirm_group': '✅ 确定分组',
        'split_data': '✂️ 分割数据',
        'mark_optimal': '🏆 选定最优'
    };

    container.innerHTML = operations.slice().reverse().slice(0, 50).map(op => {
        const time = new Date(op.timestamp).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const typeLabel = typeLabels[op.type] || op.type;
        return `
            <div class="operation-item">
                <span class="op-time">${time}</span>
                <span class="op-student">${escapeHtml(op.student)}</span>
                <span class="op-module">${escapeHtml(op.module || '')}</span>
                <span class="op-type">${typeLabel}</span>
                <span class="op-detail">${escapeHtml(op.detail || '')}</span>
            </div>
        `;
    }).join('');
}
