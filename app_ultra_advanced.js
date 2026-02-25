// ╔══════════════════════════════════════════════════════════════════════════╗
// ║   ELSA 4.0 — ULTRA ADVANCED AI ASSISTANT — COMPLETE MERGED EDITION     ║
// ║   All original commands + AI chat + Desktop apps + Screen Record       ║
// ╚══════════════════════════════════════════════════════════════════════════╝

class ElsaUltraAI {
    constructor() {
        this.apiUrl = 'http://localhost:5000';
        this.activeModel = 'auto';
        this.isListening = false;
        this.autoVoiceMode = false;
        this.voiceReplyEnabled = true;
        this.contextEnabled = true;
        this.autoActionEnabled = true;
        this.visionEnabled = false;
        this.recognition = null;
        this.synth = window.speechSynthesis;
        this.voices = [];
        this.mediaRecorder = null;
        this.recordedChunks = [];
        this.isRecording = false;
        this.backendOnline = false;
        this.attachedImages = [];
        this.attachedDocs = [];
        this.waveCtx = null;
        this.settings = { voiceSpeed: 1, voicePitch: 1 };
        this.normalMode = false;
        this.searchEngine = 'google';
        var saved = localStorage.getItem('elsa4-settings');
        if (saved) { try { Object.assign(this.settings, JSON.parse(saved)); } catch (e) {} }
        this.init();
    }

    // ══════════════════════════════════════════════
    // INIT
    // ══════════════════════════════════════════════
    async init() {
        this.setupWaveform();
        this.setupSpeechRecognition();
        this.loadVoices();
        await this.checkBackend();
        this.startStatsPoll();
        this.updateTime();
        setInterval(function(self) { return function() { self.updateTime(); }; }(this), 1000);
        var self = this;
        setTimeout(function() {
            var hour = new Date().getHours();
            var greet = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
            self.addMsg(greet + "! I'm ELSA 4.0 — your ultra-advanced AI assistant. " +
                (self.backendOnline ? 'All systems online! 🟢' :
                    'Running in browser mode — start backend.py for full features.'), 'ai');
            self.speak(greet + "! Initializing ELSA...");
        }, 800);
    }

    updateTime() {
        var el = document.getElementById('currentTime');
        if (el) el.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    }

    // ══════════════════════════════════════════════
    // BACKEND CHECK
    // ══════════════════════════════════════════════
    async checkBackend() {
        try {
            var r = await fetch(this.apiUrl + '/api/health', { signal: AbortSignal.timeout(3000) });
            var d = await r.json();
            this.backendOnline = true;
            var cnt = 0;
            if (d.providers && d.providers.openai) cnt++;
            if (d.providers && d.providers.anthropic) cnt++;
            if (d.providers && d.providers.google) cnt++;
            var bsEl = document.getElementById('backendStatus');
            if (bsEl) { bsEl.textContent = '🟢 Online';
                bsEl.style.color = '#0f0'; }
            var aiEl = document.getElementById('aiModelCount');
            if (aiEl) aiEl.textContent = cnt + ' AI models';
            var osEl = document.getElementById('osInfo');
            if (osEl) osEl.textContent = d.os || '—';
            this.setStatus('Online', 'ready');
        } catch (e) {
            this.backendOnline = false;
            var bsEl = document.getElementById('backendStatus');
            if (bsEl) { bsEl.textContent = '🔴 Offline';
                bsEl.style.color = '#f44'; }
            this.setStatus('Browser Mode', 'ready');
        }
    }

    async api(endpoint, method, body) {
        method = method || 'GET';
        var opts = { method: method, headers: { 'Content-Type': 'application/json' } };
        if (body) opts.body = JSON.stringify(body);
        try {
            var r = await fetch(this.apiUrl + endpoint, opts);
            if (!r.ok) return { success: false, message: 'HTTP ' + r.status };
            return r.json();
        } catch (e) {
            return { success: false, message: 'Network error: ' + e.message };
        }
    }

    startStatsPoll() {
        var self = this;
        var poll = async function() {
            if (!self.backendOnline) return;
            try {
                var d = await self.api('/api/system/info');
                if (d.success && d.info) {
                    var i = d.info;
                    var cpuEl = document.getElementById('cpuStat');
                    var memEl = document.getElementById('memStat');
                    if (cpuEl) cpuEl.textContent = i.cpu_usage + '%';
                    if (memEl) memEl.textContent = i.memory_percent + '%';
                }
            } catch (e) {}
        };
        poll();
        setInterval(poll, 10000);
    }

    // ══════════════════════════════════════════════
    // SPEECH RECOGNITION
    // ══════════════════════════════════════════════
    setupSpeechRecognition() {
        var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (!SR) { console.warn('No Speech Recognition API - use Chrome'); return; }
        this.recognition = new SR();
        this.recognition.continuous = false;
        this.recognition.interimResults = true;
        this.recognition.lang = 'en-US';
        var self = this;

        this.recognition.onresult = function(e) {
            var interim = '',
                final_ = '';
            for (var i = e.resultIndex; i < e.results.length; i++) {
                if (e.results[i].isFinal) final_ += e.results[i][0].transcript;
                else interim += e.results[i][0].transcript;
            }
            var inp = document.getElementById('textInput');
            if (inp) inp.value = final_ || interim;
            if (final_) self.processFinalVoice(final_);
        };

        this.recognition.onerror = function(e) {
            if (e.error === 'no-speech' && self.autoVoiceMode) { self.restartAuto(); return; }
            if (e.error === 'not-allowed') {
                self.addMsg('❌ Microphone permission denied. Please allow microphone access.', 'ai');
            }
            self.stopListening();
        };

        this.recognition.onend = function() {
            if (self.autoVoiceMode && self.isListening) {
                setTimeout(function() { try { self.recognition.start(); } catch (e) {} }, 300);
            } else {
                self.isListening = false;
                self.updateMicUI();
                self.setStatus('Ready', 'ready');
            }
        };
    }

    processFinalVoice(text) {
        var inp = document.getElementById('textInput');
        if (inp) inp.value = '';
        this.addMsg(text, 'user');
        this.handleCommand(text.toLowerCase(), text);
    }

    toggleMic() {
        if (this.isListening) this.stopListening();
        else this.startListening();
    }

    startListening() {
        if (!this.recognition) {
            this.showToast('Use Chrome browser for voice features', 'warning');
            return;
        }
        try {
            this.recognition.start();
            this.isListening = true;
            this.updateMicUI();
            this.setStatus('Listening…', 'listening');
        } catch (e) { console.warn('Listen error:', e); }
    }

    stopListening() {
        if (this.recognition) { try { this.recognition.stop(); } catch (e) {} }
        this.isListening = false;
        this.autoVoiceMode = false;
        this.updateMicUI();
        this.setStatus('Ready', 'ready');
        var btn = document.getElementById('autoVoiceBtn');
        if (btn) btn.classList.remove('active');
    }

    restartAuto() {
        if (!this.autoVoiceMode) return;
        var self = this;
        setTimeout(function() { try { self.recognition.start(); } catch (e) {} }, 400);
    }

    toggleAutoVoice() {
        this.autoVoiceMode = !this.autoVoiceMode;
        var btn = document.getElementById('autoVoiceBtn');
        if (this.autoVoiceMode) {
            this.startListening();
            if (btn) btn.classList.add('active');
            this.showToast('🎤 Auto Voice ON — always listening!', 'success');
        } else {
            this.stopListening();
            if (btn) btn.classList.remove('active');
            this.showToast('🔇 Auto Voice OFF', 'info');
        }
    }

    updateMicUI() {
        var mic = document.getElementById('micBtn');
        if (!mic) return;
        if (this.isListening) {
            mic.classList.add('active');
            mic.innerHTML = '<i class="fas fa-microphone-slash"></i><div class="mic-pulse"></div>';
        } else {
            mic.classList.remove('active');
            mic.innerHTML = '<i class="fas fa-microphone"></i><div class="mic-pulse"></div>';
        }
    }

    // ══════════════════════════════════════════════
    // TTS
    // ══════════════════════════════════════════════
    loadVoices() {
        var self = this;
        var load = function() {
            self.voices = self.synth.getVoices();
            self.populateVoiceSelect();
        };
        load();
        if (this.synth.onvoiceschanged !== undefined) this.synth.onvoiceschanged = load;
    }

    populateVoiceSelect() {
        var sel = document.getElementById('voiceSelect');
        if (!sel) return;
        sel.innerHTML = '';
        for (var i = 0; i < this.voices.length; i++) {
            var v = this.voices[i];
            var opt = document.createElement('option');
            opt.value = i;
            opt.textContent = v.name + ' (' + v.lang + ')';
            if (v.name.toLowerCase().includes('female') || v.name.includes('Samantha') ||
                v.name.includes('Zira') || v.name.includes('Google UK English Female')) {
                opt.selected = true;
            }
            sel.appendChild(opt);
        }
    }

    speak(text) {
        if (!this.voiceReplyEnabled) return;
        this.synth.cancel();
        var clean = text.replace(/[#*`>]/g, '').substring(0, 500);
        var utt = new SpeechSynthesisUtterance(clean);
        utt.rate = this.settings.voiceSpeed || 1;
        utt.pitch = this.settings.voicePitch || 1;
        utt.volume = 1;
        var sel = document.getElementById('voiceSelect');
        var idx = sel ? parseInt(sel.value) : -1;
        if (idx >= 0 && this.voices[idx]) {
            utt.voice = this.voices[idx];
        } else {
            for (var i = 0; i < this.voices.length; i++) {
                var vn = this.voices[i].name;
                if (vn.includes('Female') || vn.includes('Samantha') || vn.includes('Zira') ||
                    vn.includes('Google UK English Female')) {
                    utt.voice = this.voices[i];
                    break;
                }
            }
        }
        this.synth.speak(utt);
    }

    stopSpeaking() { this.synth.cancel(); }

    async speakElevenLabs(text, voiceId) {
        voiceId = voiceId || '21m00Tcm4TlvDq8ikWAM';
        if (!this.backendOnline) { this.speak(text); return; }
        try {
            var d = await this.api('/api/tts/elevenlabs', 'POST', { text: text, voice_id: voiceId });
            if (d.success && d.audio) {
                var audio = new Audio('data:audio/mpeg;base64,' + d.audio);
                audio.play();
                return;
            }
        } catch (e) {}
        this.speak(text);
    }

    // ══════════════════════════════════════════════
    // MAIN COMMAND HANDLER — ALL COMMANDS MERGED
    // ══════════════════════════════════════════════
    async handleCommand(lower, original) {
        this.setStatus('Processing…', 'processing');

        // ── GREETINGS ──
        if (/^(hey elsa|hello elsa|hi elsa|elsa)$/i.test(lower.trim())) {
            var r = 'Hello! How may I help you?';
            this.addMsg(r, 'ai');
            this.speak(r);
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/good\s*morning/i.test(lower)) {
            this.speak('Good Morning! Have a great day!');
            this.addMsg('Good Morning! Have a great day! ☀️', 'ai');
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/good\s*night/i.test(lower)) {
            this.speak('Good Night! Sweet dreams!');
            this.addMsg('Good Night! Sweet dreams! 🌙', 'ai');
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/good\s*(afternoon|evening)/i.test(lower)) {
            this.speak('Good ' + (lower.includes('afternoon') ? 'Afternoon' : 'Evening') + '!');
            this.addMsg('Good ' + (lower.includes('afternoon') ? 'Afternoon' : 'Evening') + '! 👋', 'ai');
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── ABOUT ELSA ──
        if (/who created you|who made you|your creator|who built you/i.test(lower)) {
            var r = "I am created by Ashrith. I am ELSA 4.0 — an Ultra Advanced AI Assistant!";
            this.addMsg(r, 'ai');
            this.speak(r);
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/what is your name|your name|who are you|what are you/i.test(lower)) {
            var r = "My name is ELSA 4.0. I am a virtual AI assistant created by Ashrith. How can I help you?";
            this.addMsg(r, 'ai');
            this.speak(r);
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/what.*work|what can you do/i.test(lower)) {
            var r = "My work is to open apps, search any information on Google, open any video or song on YouTube, find locations on Google Maps, check weather, control your PC, take screenshots, record screen, and answer any question!";
            this.addMsg(r, 'ai');
            this.speak(r);
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── TIME & DATE ──
        if (/\btime\b/.test(lower) && !/youtube|spotify|anytime|sometime|lifetime|bedtime|part.?time|full.?time/i.test(lower)) {
            var t = new Date().toLocaleString(undefined, { hour: 'numeric', minute: 'numeric' });
            this.addMsg('🕐 Current time: ' + t, 'ai');
            this.speak('The time is ' + t);
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/\bdate\b/.test(lower) && !/update|candidate|mandate|graduate/i.test(lower)) {
            var d = new Date().toLocaleString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
            this.addMsg('📅 Today is ' + d, 'ai');
            this.speak('Today is ' + d);
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── SCREENSHOT ──
        if (/screenshot|capture screen|take screen|snap screen/i.test(lower)) {
            await this.doScreenshot();
            return;
        }

        // ── SCREEN RECORD — checked BEFORE app pattern to avoid "start recording" → open_app ──
        if (/start.*(record|recording)|record.*(screen|desktop)/i.test(lower)) {
            await this.startScreenRecord();
            return;
        }
        if (/stop.*(record|recording)/i.test(lower)) {
            this.stopScreenRecord();
            return;
        }

        // ── SYSTEM INFO ──
        if (/system info|system status|cpu usage|memory usage|ram usage|computer info/i.test(lower)) {
            await this.showSysInfo();
            return;
        }

        // ── RUNNING APPS ──
        if (/running apps|list apps|active apps|running processes|what.*running/i.test(lower)) {
            await this.showRunningApps();
            return;
        }

        // ── POWER COMMANDS ──
        if (/^shut\s*down|^shutdown|^turn off (the )?(pc|computer|laptop)/i.test(lower)) {
            this.showPanel('powerPanel');
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/^restart|^reboot/i.test(lower)) {
            if (this.backendOnline) {
                var d = await this.api('/api/command', 'POST', { action: 'restart', params: {} });
                this.addMsg(d.message, 'ai');
                this.speak(d.message);
            }
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/^sleep|go to sleep|standby/i.test(lower)) {
            if (this.backendOnline) {
                var d = await this.api('/api/command', 'POST', { action: 'sleep', params: {} });
                this.addMsg(d.message, 'ai');
            }
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/lock (screen|pc|computer)|^lock$/i.test(lower)) {
            if (this.backendOnline) {
                var d = await this.api('/api/command', 'POST', { action: 'lock_screen', params: {} });
                this.addMsg(d.message, 'ai');
                this.speak(d.message);
            }
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── DESKTOP APPS (via backend) ──
        var appPattern = /^(?:open|launch|start|run)\s+(.+)/i;
        var appMatch = lower.match(appPattern);
        if (appMatch) {
            var appName = appMatch[1].trim().replace(/\s*(app|application|program|software)$/i, '').trim();
            // Web shortcuts that should open in browser not desktop
            var webOnly = [
                'google', 'youtube', 'facebook', 'instagram', 'twitter', 'x', 'whatsapp', 'whatsapp web',
                'telegram', 'telegram web', 'snapchat', 'discord', 'reddit', 'linkedin', 'pinterest', 'tiktok',
                'gmail', 'drive', 'docs', 'sheets', 'slides', 'meet', 'classroom', 'chatgpt', 'gemini', 'claude',
                'copilot', 'perplexity', 'bing', 'github', 'stackoverflow', 'codepen', 'replit', 'netlify', 'vercel',
                'amazon', 'flipkart', 'ebay', 'netflix', 'hotstar', 'prime', 'prime video', 'spotify', 'wikipedia',
                'outlook', 'microsoft', 'office', 'onedrive', 'notion', 'canva', 'figma', 'trello', 'gamma',
                'news', 'bbc', 'cnn', 'ndtv', 'zoom', 'twitch', 'maps', 'google maps', 'translate', 'photos',
                'calendar', 'scholar', 'playstore', 'play store', 'presentation', 'ai ppt',
                'college', 'my college', 'library', 'college library', 'scientific calculator', 'desmos', 'freefire',
                'one', 'one news', 'kannada news', 'two', 'two news', 'engineering news', 'three', 'three news', 'science news',
                'digital clock', 'normal clock', 'typing test', 'daily water', 'gym', 'number guessing',
                'reminder', 'butterfly', 'rubiks cube', 'stars', 'flower', 'birthday', 'wolfram', 'duckduckgo',
                'word online', 'excel online', 'powerpoint online',
            ];
            var isWebOnly = false;
            for (var i = 0; i < webOnly.length; i++) {
                if (appName === webOnly[i] || appName.includes(webOnly[i]) || webOnly[i].includes(appName)) {
                    isWebOnly = true;
                    break;
                }
            }
            if (isWebOnly) { await this.openWebsite(appName); return; }
            await this.openApp(appName);
            return;
        }

        // ── PLAY YOUTUBE ──
        var ytPatterns = [
            /^play\s+(.+?)(?:\s+(?:on|in)\s+youtube)?$/i,
            /^(?:search|find)\s+(.+?)\s+(?:on|in)\s+youtube/i,
            /^youtube\s+(.+)/i,
            /^(?:song|video|music)\s+(.+)/i,
        ];
        for (var i = 0; i < ytPatterns.length; i++) {
            var m = lower.match(ytPatterns[i]);
            if (m) { await this.playYouTube(m[1].trim()); return; }
        }
        if (/\b(songs?|movies?|videos?)\b/.test(lower) && !/search|wikipedia|google/.test(lower)) {
            await this.playYouTube(lower);
            return;
        }

        // ── SEARCH WIKIPEDIA ──
        var wikiMatch = lower.match(/(?:search|open|look up|find)?\s*wikipedia\s+(?:for\s+)?(.+)/i);
        if (wikiMatch) { await this.searchWikipedia(wikiMatch[1].trim()); return; }
        if (/\bwikipedia\b/.test(lower)) { await this.searchWikipedia(lower.replace(/wikipedia/i, '').trim()); return; }

        // ── SEARCH EDGE ──
        var edgeMatch = lower.match(/(?:search|open|find)\s+(?:in\s+)?(?:edge|bing)\s+(?:for\s+)?(.+)/i);
        if (edgeMatch) { await this.searchEdge(edgeMatch[1].trim()); return; }

        // ── SEARCH CHROME ──
        var chromeMatch = lower.match(/(?:search|open|find)\s+(?:in\s+)?chrome\s+(?:for\s+)?(.+)/i);
        if (chromeMatch) { await this.searchChrome(chromeMatch[1].trim()); return; }

        // ── SEARCH CHATGPT ──
        var gptMatch = lower.match(/(?:ask|search|open|find)\s+(?:in\s+)?(?:chatgpt|chat\s*gpt|gpt)\s+(?:about\s+)?(.+)/i);
        if (gptMatch) { await this.searchChatGPT(gptMatch[1].trim()); return; }

        // ── SEARCH CLAUDE ──
        if (/\b(ask|open|search)\s+(claude|anthropic)\b/i.test(lower)) {
            window.open('https://claude.ai', '_blank');
            this.addMsg('Opening Claude AI...', 'ai');
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── SEARCH GOOGLE ──
        var googleMatch = lower.match(/(?:search|find|look up)\s+(?:google\s+)?(?:for\s+)?(.+)/i);
        if (googleMatch) { await this.searchGoogle(googleMatch[1].trim()); return; }

        // ── WHAT IS / WHO IS ──
        if (/^(what is|what are|who is|who are|where is|when is|how is|why is)\b/i.test(lower)) {
            await this.searchGoogle(lower);
            return;
        }

        // ── OPEN WEBSITES ──
        var siteMatch = lower.match(/^(?:open|go to|visit|browse|navigate to)\s+(.+)/i);
        if (siteMatch) { await this.openWebsite(siteMatch[1].trim()); return; }

        // ── LOCATION ──
        var locMatch = lower.match(/(?:find\s+)?location\s+(?:of\s+)?(.+)/i);
        if (locMatch) {
            window.open('https://www.google.com/maps/search/' + encodeURIComponent(locMatch[1]), '_blank');
            this.addMsg('📍 Opening location for: ' + locMatch[1], 'ai');
            this.speak('Opening location');
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── WEATHER ──
        var weatherMatch = lower.match(/weather\s+(?:in\s+|of\s+)?(.+)/i);
        if (/weather/.test(lower)) {
            var loc = weatherMatch ? weatherMatch[1].trim() : '';
            window.open('https://www.google.com/search?q=weather+' + encodeURIComponent(loc || 'today'), '_blank');
            this.addMsg('🌦️ Opening weather' + (loc ? ' for ' + loc : '') + '...', 'ai');
            this.speak('Opening weather');
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── CALCULATOR ──
        if (/calculator|calc\b/.test(lower)) {
            window.open('https://www.google.com/search?q=calculator', '_blank');
            this.addMsg('🔢 Opening calculator...', 'ai');
            this.speak('Opening calculator');
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── GENERATE IMAGE ──
        if (/generate.*image|create.*image|draw\s+(.+)|make.*image/i.test(lower)) {
            var imgMatch = lower.match(/(?:generate|create|draw|make)\s+(?:an?\s+)?(?:image\s+(?:of\s+)?)?(.+)/i);
            if (imgMatch) { await this.generateImage(imgMatch[1].trim()); return; }
        }

        // ── CLEAR ──
        if (/clear\s+(chat|history|screen|conversation)/i.test(lower)) {
            this.clearChat();
            return;
        }

        // ── PHONE / SMS / WHATSAPP ──
        if (/open phone|phone dialer|make a call/i.test(lower)) {
            window.open('tel:', '_blank');
            this.addMsg('📱 Opening Phone Dialer...', 'ai');
            this.speak('Opening Phone Dialer');
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/open sms|send sms|open message\b/i.test(lower)) {
            window.open('sms:', '_blank');
            this.addMsg('💬 Opening SMS...', 'ai');
            this.speak('Opening SMS');
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/whatsapp\s*call/i.test(lower)) {
            window.open('https://wa.me/', '_blank');
            this.addMsg('📞 Opening WhatsApp Call...', 'ai');
            this.speak('Opening WhatsApp call');
            this.setStatus('Ready', 'ready');
            return;
        }
        if (/open camera/i.test(lower)) {
            window.open('camera://', '_blank');
            this.addMsg('📷 Opening Camera...', 'ai');
            this.speak('Opening camera');
            this.setStatus('Ready', 'ready');
            return;
        }

        // ── NORMAL MODE: direct search without AI ──
        if (this.normalMode) { await this.normalModeSearch(original); return; }

        // ── AI CHAT FALLBACK ──
        await this.chatWithAI(original);
    }

    // ══════════════════════════════════════════════
    // NORMAL MODE
    // ══════════════════════════════════════════════
    async normalModeSearch(query) {
        var eng = this.normalSearchEngine || 'google';
        var q = encodeURIComponent(query);
        var urls = {
            'google': 'https://www.google.com/search?q=' + q,
            'bing': 'https://www.bing.com/search?q=' + q,
            'edge': 'https://www.bing.com/search?q=' + q,
            'chrome': 'https://www.google.com/search?q=' + q,
            'youtube': 'https://www.youtube.com/results?search_query=' + q,
            'duckduckgo': 'https://duckduckgo.com/?q=' + q,
            'wikipedia': 'https://en.wikipedia.org/wiki/Special:Search?search=' + q,
        };
        var url = urls[eng] || urls['google'];
        if ((eng === 'edge' || eng === 'chrome') && this.backendOnline) {
            try {
                var d = await this.api('/api/command', 'POST', { action: 'search_' + eng, params: { query: query } });
                this.addMsg('🔍 [Normal Mode] Searching ' + eng.toUpperCase() + ' for: ' + query, 'ai');
                this.speak('Searching ' + eng + ' for ' + query);
                this.setStatus('Ready', 'ready');
                return;
            } catch (e) {}
        }
        window.open(url, '_blank');
        this.addMsg('🔍 [Normal Mode] Searching ' + eng.toUpperCase() + ' for: ' + query, 'ai');
        this.speak('Searching for ' + query);
        this.setStatus('Ready', 'ready');
    }

    toggleMode() {
        this.normalMode = !this.normalMode;
        var btn = document.getElementById('modeToggleBtn');
        var chip = document.getElementById('modeChip');
        var bar = document.getElementById('normalModeBar');
        if (this.normalMode) {
            if (btn) { btn.innerHTML = '<i class="fas fa-robot"></i>';
                btn.title = 'Switch to AI Mode'; }
            if (chip) { chip.textContent = '⚡ Normal Mode';
                chip.classList.add('normal'); }
            if (bar) bar.style.display = 'flex';
            this.showToast('⚡ Normal Mode ON — Direct search, no AI', 'warning');
            this.speak('Normal mode activated. I will search directly without AI.');
            this.addMsg('⚡ **Normal Mode ON** — Type or speak anything to search directly! Choose your engine below: Google, Edge, Chrome, YouTube, Bing, or Wikipedia. No AI — instant results!', 'ai');
        } else {
            if (btn) { btn.innerHTML = '<i class="fas fa-toggle-on"></i>';
                btn.title = 'Switch to Normal Mode'; }
            if (chip) { chip.textContent = '🤖 AI Mode';
                chip.classList.remove('normal'); }
            if (bar) bar.style.display = 'none';
            this.showToast('🤖 AI Mode ON — Powered by Claude/GPT/Gemini', 'success');
            this.speak('AI mode activated. Powered by artificial intelligence.');
            this.addMsg('🤖 **AI Mode ON** — Powered by Claude / GPT-4o / Gemini. Ask me anything!', 'ai');
        }
    }

    setNormalEngine(eng) {
        this.normalSearchEngine = eng;
        var btns = document.querySelectorAll('.nm-eng');
        for (var i = 0; i < btns.length; i++) btns[i].classList.remove('active');
        var map = { google: 'nmGoogle', edge: 'nmEdge', chrome: 'nmChrome', youtube: 'nmYoutube', bing: 'nmBing', wikipedia: 'nmWiki' };
        var el = document.getElementById(map[eng]);
        if (el) el.classList.add('active');
        this.showToast('Engine: ' + eng.toUpperCase(), 'info');
    }

    // ══════════════════════════════════════════════
    // WEBSITE OPENER
    // ══════════════════════════════════════════════
    async openWebsite(name) {
        var n = name.toLowerCase().trim();
        var sites = {
            'google': 'https://google.com',
            'youtube': 'https://youtube.com',
            'facebook': 'https://facebook.com',
            'instagram': 'https://www.instagram.com',
            'twitter': 'https://twitter.com',
            'x': 'https://x.com',
            'whatsapp': 'https://wa.me/',
            'telegram': 'https://web.telegram.org',
            'snapchat': 'https://web.snapchat.com',
            'discord': 'https://discord.com/app',
            'reddit': 'https://reddit.com',
            'linkedin': 'https://linkedin.com',
            'pinterest': 'https://pinterest.com',
            'tiktok': 'https://tiktok.com',
            'gmail': 'https://mail.google.com',
            'drive': 'https://drive.google.com',
            'docs': 'https://docs.google.com',
            'sheets': 'https://sheets.google.com',
            'slides': 'https://slides.google.com',
            'meet': 'https://meet.google.com',
            'maps': 'https://maps.google.com',
            'google maps': 'https://maps.google.com',
            'translate': 'https://translate.google.co.in',
            'photos': 'https://photos.google.com',
            'calendar': 'https://calendar.google.com',
            'classroom': 'https://classroom.google.com',
            'scholar': 'https://scholar.google.com',
            'playstore': 'https://play.google.com',
            'play store': 'https://play.google.com',
            'chatgpt': 'https://chat.openai.com',
            'claude': 'https://claude.ai',
            'gemini': 'https://gemini.google.com',
            'copilot': 'https://copilot.microsoft.com',
            'perplexity': 'https://perplexity.ai',
            'bing': 'https://bing.com',
            'github': 'https://github.com',
            'stackoverflow': 'https://stackoverflow.com',
            'codepen': 'https://codepen.io',
            'replit': 'https://replit.com',
            'vercel': 'https://vercel.com',
            'netlify': 'https://netlify.com',
            'amazon': 'https://amazon.com',
            'flipkart': 'https://flipkart.com',
            'ebay': 'https://ebay.com',
            'netflix': 'https://netflix.com',
            'hotstar': 'https://hotstar.com',
            'prime': 'https://primevideo.com',
            'prime video': 'https://primevideo.com',
            'spotify': 'https://open.spotify.com',
            'wikipedia': 'https://wikipedia.org',
            'outlook': 'https://outlook.com',
            'microsoft': 'https://m365.cloud.microsoft',
            'office': 'https://www.microsoft365.com',
            'word online': 'https://www.microsoft365.com/launch/word',
            'excel online': 'https://www.microsoft365.com/launch/excel',
            'powerpoint online': 'https://www.microsoft365.com/launch/powerpoint',
            'onedrive': 'https://onedrive.live.com',
            'notion': 'https://notion.so',
            'canva': 'https://canva.com',
            'figma': 'https://figma.com',
            'trello': 'https://trello.com',
            'gamma': 'https://gamma.app',
            'presentation': 'https://gamma.app',
            'ai ppt': 'https://gamma.app',
            'news': 'https://news.google.com',
            'bbc': 'https://bbc.com',
            'cnn': 'https://cnn.com',
            'ndtv': 'https://ndtv.com',
            'indian express': 'https://indianexpress.com',
            'times of india': 'https://timesofindia.indiatimes.com',
            'zoom': 'https://zoom.us',
            'twitch': 'https://twitch.tv',
            'digital clock': 'https://digital-clock-mine24.netlify.app/',
            'normal clock': 'https://normal-clock-mine24.netlify.app/',
            'typing test': 'https://typing-testing-wesite69.netlify.app/',
            'daily water': 'https://daily-water-calculater69.netlify.app/',
            'gym': 'https://solo-leveling-gym69.netlify.app/',
            'number guessing': 'https://number-guessing-game69.netlify.app/',
            'reminder': 'https://reminder-app-website69.netlify.app/',
            'butterfly': 'https://butterfly-flying-72683d.netlify.app/',
            'rubiks cube': 'https://rubic-cube-7268.netlify.app/',
            'stars': 'https://canvas-star-7268.netlify.app/',
            'flower': 'https://moonlit-happy-birthday-32607a.netlify.app/',
            'birthday': 'https://youre-specialday-madam.netlify.app/',
            'wolfram': 'https://wolframalpha.com',
            'duckduckgo': 'https://duckduckgo.com',
            'college': 'https://sode-edu.in',
            'my college': 'https://sode-edu.in',
            'library': 'https://smvitm.easylib.net',
            'college library': 'https://smvitm.easylib.net',
            'scientific calculator': 'https://www.desmos.com/scientific',
            'desmos': 'https://www.desmos.com/scientific',
            'freefire': 'https://ff.garena.com',
            'one': 'https://vijaykarnataka.com/?utm_source=1',
            'one news': 'https://vijaykarnataka.com/?utm_source=1',
            'kannada news': 'https://vijaykarnataka.com/?utm_source=1',
            'two': 'https://www.engineeringnews.co.za/',
            'two news': 'https://www.engineeringnews.co.za/',
            'engineering news': 'https://www.engineeringnews.co.za/',
            'three': 'https://www.sciencenews.org/',
            'three news': 'https://www.sciencenews.org/',
            'science news': 'https://www.sciencenews.org/',
        };

        var url = sites[n];
        if (!url) {
            for (var key in sites) {
                if (n.includes(key) || key.includes(n)) { url = sites[key]; break; }
            }
        }
        if (!url) {
            if (n.startsWith('http://') || n.startsWith('https://')) url = n;
            else if (n.includes('.')) url = 'https://' + n;
            else url = 'https://www.' + n + '.com';
        }

        if (this.backendOnline) {
            try { await this.api('/api/command', 'POST', { action: 'open_website', params: { url: n } }); } catch (e) {}
        }
        window.open(url, '_blank');
        this.addMsg('🌐 Opening ' + name + '...', 'ai');
        this.speak('Opening ' + name);
        this.setStatus('Ready', 'ready');
    }

    // ══════════════════════════════════════════════
    // SEARCH FUNCTIONS
    // ══════════════════════════════════════════════
    async searchGoogle(query) {
        var url = 'https://www.google.com/search?q=' + encodeURIComponent(query);
        if (this.backendOnline) {
            try { await this.api('/api/command', 'POST', { action: 'search_google', params: { query: query } }); } catch (e) { window.open(url, '_blank'); }
        } else window.open(url, '_blank');
        this.addMsg('🔍 Searching Google for: ' + query, 'ai');
        this.speak('Searching Google for ' + query);
        this.setStatus('Ready', 'ready');
    }

    async searchWikipedia(query) {
        var url = 'https://en.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(query);
        if (this.backendOnline) {
            try { await this.api('/api/command', 'POST', { action: 'search_wikipedia', params: { query: query } }); } catch (e) { window.open(url, '_blank'); }
        } else window.open(url, '_blank');
        this.addMsg('📖 Searching Wikipedia for: ' + query, 'ai');
        this.speak('Searching Wikipedia for ' + query);
        this.setStatus('Ready', 'ready');
    }

    async searchEdge(query) {
        var url = 'https://www.bing.com/search?q=' + encodeURIComponent(query);
        if (this.backendOnline) {
            var d = await this.api('/api/command', 'POST', { action: 'search_edge', params: { query: query } });
            if (d.success) {
                this.addMsg('🔵 Opening Microsoft Edge → Searching: ' + query, 'ai');
                this.speak('Searching Edge for ' + query);
                this.setStatus('Ready', 'ready');
                return;
            }
        }
        window.open(url, '_blank');
        this.addMsg('🔵 Searching Bing (Edge) for: ' + query, 'ai');
        this.speak('Searching Edge for ' + query);
        this.setStatus('Ready', 'ready');
    }

    async searchChrome(query) {
        var url = 'https://www.google.com/search?q=' + encodeURIComponent(query);
        if (this.backendOnline) {
            var d = await this.api('/api/command', 'POST', { action: 'search_chrome', params: { query: query } });
            if (d.success) {
                this.addMsg('🔴 Opening Google Chrome → Searching: ' + query, 'ai');
                this.speak('Searching Chrome for ' + query);
                this.setStatus('Ready', 'ready');
                return;
            }
        }
        window.open(url, '_blank');
        this.addMsg('🔴 Searching Google (Chrome) for: ' + query, 'ai');
        this.speak('Searching Chrome for ' + query);
        this.setStatus('Ready', 'ready');
    }

    async searchChatGPT(query) {
        var url = 'https://chatgpt.com/?q=' + encodeURIComponent(query);
        window.open(url, '_blank');
        this.addMsg('🤖 Searching ChatGPT for: ' + query, 'ai');
        this.speak('Opening ChatGPT');
        this.setStatus('Ready', 'ready');
    }

    async playYouTube(query) {
        var url = 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
        if (this.backendOnline) {
            try { await this.api('/api/command', 'POST', { action: 'play_youtube', params: { query: query } }); } catch (e) { window.open(url, '_blank'); }
        } else window.open(url, '_blank');
        this.addMsg('🎵 Playing "' + query + '" on YouTube!', 'ai');
        this.speak('Playing ' + query + ' on YouTube');
        this.setStatus('Ready', 'ready');
    }

    // ══════════════════════════════════════════════
    // DESKTOP APP OPENER
    // ══════════════════════════════════════════════
    async openApp(name) {
        this.addMsg('🖥️ Opening ' + name + '…', 'ai');
        this.speak('Opening ' + name);
        this.setStatus('Opening…', 'processing');
        if (!this.backendOnline) {
            this.addMsg('⚠️ Backend needed to open desktop apps. Run: python backend_ultra_advanced_FIXED.py', 'ai');
            this.setStatus('Ready', 'ready');
            return;
        }
        try {
            var d = await this.api('/api/system/open-app', 'POST', { app_name: name });
            if (d.success) {
                this.addMsg(d.message, 'ai');
                this.showToast(d.message, 'success');
            } else {
                this.addMsg(d.message, 'ai');
                this.speak('Could not open ' + name + '. Make sure it is installed.');
            }
        } catch (e) {
            this.addMsg('❌ Error opening ' + name + ': ' + e.message, 'ai');
        }
        this.setStatus('Ready', 'ready');
    }

    // ══════════════════════════════════════════════
    // SCREENSHOT
    // ══════════════════════════════════════════════
    async doScreenshot() {
        this.addMsg('📸 Taking screenshot…', 'ai');
        this.speak('Taking screenshot');
        this.setStatus('Capturing…', 'processing');
        if (!this.backendOnline) {
            this.addMsg('⚠️ Backend needed. Install: pip install pillow\nThen run: python backend_ultra_advanced_FIXED.py', 'ai');
            this.setStatus('Ready', 'ready');
            return;
        }
        try {
            var d = await this.api('/api/screenshot', 'POST');
            if (d.success) {
                if (d.image) {
                    var modal = document.getElementById('screenshotModal');
                    var img = document.getElementById('screenshotImg');
                    var dl = document.getElementById('screenshotDownload');
                    if (img) img.src = 'data:image/png;base64,' + d.image;
                    if (dl) dl.href = 'data:image/png;base64,' + d.image;
                    if (modal) modal.classList.add('active');
                    this.addMsg('✅ ' + d.message, 'ai');
                    this.speak('Screenshot taken!');
                } else {
                    this.addMsg('✅ ' + d.message, 'ai');
                }
            } else {
                this.addMsg('❌ ' + d.message, 'ai');
                this.speak('Screenshot failed. ' + d.message);
            }
        } catch (e) {
            this.addMsg('❌ Screenshot error: ' + e.message, 'ai');
        }
        this.setStatus('Ready', 'ready');
    }

    // ══════════════════════════════════════════════
    // SCREEN RECORDING — uses browser getDisplayMedia
    // ══════════════════════════════════════════════
    async startScreenRecord() {
        if (this.isRecording) { this.showToast('Already recording!', 'warning'); return; }
        try {
            var stream = await navigator.mediaDevices.getDisplayMedia({ video: { cursor: 'always' }, audio: true });
            this.recordedChunks = [];
            var self = this;
            var mimeType = 'video/webm;codecs=vp9';
            if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';
            this.mediaRecorder = new MediaRecorder(stream, { mimeType: mimeType });
            this.mediaRecorder.ondataavailable = function(e) { if (e.data.size > 0) self.recordedChunks.push(e.data); };
            this.mediaRecorder.onstop = function() { self.saveRecording(stream); };
            this.mediaRecorder.start(100);
            this.isRecording = true;
            var btn = document.getElementById('screenRecordBtn');
            if (btn) { btn.classList.add('recording');
                btn.innerHTML = '<i class="fas fa-stop-circle"></i><span>Stop</span>'; }
            this.addMsg('🔴 Screen recording started! Click Stop or say "stop recording".', 'ai');
            this.speak('Screen recording started');
            this.showToast('🔴 Recording started', 'success');
            this.setStatus('Recording…', 'listening');
            stream.getVideoTracks()[0].onended = function() { if (self.isRecording) self.stopScreenRecord(); };
        } catch (e) {
            if (e.name === 'NotAllowedError') {
                this.addMsg('❌ Screen recording permission denied.', 'ai');
                this.speak('Permission denied for screen recording.');
            } else {
                this.addMsg('❌ Screen record error: ' + e.message, 'ai');
            }
            this.setStatus('Ready', 'ready');
        }
    }

    stopScreenRecord() {
        if (!this.isRecording || !this.mediaRecorder) { this.showToast('No active recording', 'warning'); return; }
        this.mediaRecorder.stop();
        this.isRecording = false;
        var btn = document.getElementById('screenRecordBtn');
        if (btn) { btn.classList.remove('recording');
            btn.innerHTML = '<i class="fas fa-record-vinyl"></i><span>Record</span>'; }
        this.addMsg('⏹️ Recording stopped. Preparing download…', 'ai');
        this.speak('Recording stopped. Downloading now.');
        this.setStatus('Ready', 'ready');
    }

    saveRecording(stream) {
        stream.getTracks().forEach(function(t) { t.stop(); });
        var blob = new Blob(this.recordedChunks, { type: 'video/webm' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        var ts = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
        a.href = url;
        a.download = 'elsa_recording_' + ts + '.webm';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        this.addMsg('✅ Recording saved as elsa_recording_' + ts + '.webm', 'ai');
        this.showToast('✅ Recording downloaded!', 'success');
    }

    toggleScreenRecord() {
        if (this.isRecording) this.stopScreenRecord();
        else this.startScreenRecord();
    }

    // ══════════════════════════════════════════════
    // SYSTEM INFO
    // ══════════════════════════════════════════════
    async showSysInfo() {
        if (!this.backendOnline) { this.addMsg('⚠️ Backend offline for system info.', 'ai'); return; }
        var typing = this.showTyping();
        try {
            var d = await this.api('/api/system/info');
            typing.remove();
            if (d.success) {
                var i = d.info;
                var msg = '💻 **System Information**\n' +
                    'OS: ' + i.os + ' ' + (i.os_version || '') + '\n' +
                    'Processor: ' + (i.processor || 'N/A') + '\n' +
                    'Hostname: ' + (i.hostname || 'N/A') + '\n' +
                    'Time: ' + (i.time || '') + '\n';
                if (i.cpu_usage !== undefined) {
                    msg += '\n⚡ CPU: ' + i.cpu_usage + '% (' + i.cpu_cores + ' cores)' +
                        '\n🧠 RAM: ' + (i.memory_used || 0).toFixed(1) + 'GB / ' + (i.memory_total || 0).toFixed(1) + 'GB (' + i.memory_percent + '%)' +
                        '\n💾 Disk: ' + (i.disk_used || 0).toFixed(1) + 'GB / ' + (i.disk_total || 0).toFixed(1) + 'GB (' + (i.disk_percent || 0) + '%)';
                }
                if (i.battery_percent !== undefined) {
                    msg += '\n🔋 Battery: ' + i.battery_percent + '% ' + (i.battery_plugged ? '(Charging)' : '(Unplugged)');
                }
                this.addMsg(msg, 'ai');
                this.speak('CPU at ' + i.cpu_usage + ' percent. RAM ' + i.memory_percent + ' percent used.');
            }
        } catch (e) { typing.remove();
            this.addMsg('❌ System info error: ' + e.message, 'ai'); }
        this.setStatus('Ready', 'ready');
    }

    async showRunningApps() {
        if (!this.backendOnline) { this.addMsg('⚠️ Backend offline.', 'ai'); return; }
        var typing = this.showTyping();
        try {
            var d = await this.api('/api/system/apps');
            typing.remove();
            if (d.success) {
                var msg = '🔄 **Top Running Processes** (' + d.processes.length + ' total)\n';
                for (var i = 0; i < Math.min(15, d.processes.length); i++) {
                    var p = d.processes[i];
                    msg += (i + 1) + '. ' + p.name + ' — ' + p.memory.toFixed(1) + ' MB [' + p.status + ']\n';
                }
                this.addMsg(msg, 'ai');
                this.speak('Found ' + d.processes.length + ' running processes.');
            }
        } catch (e) { typing.remove();
            this.addMsg('❌ Error: ' + e.message, 'ai'); }
        this.setStatus('Ready', 'ready');
    }

    // ══════════════════════════════════════════════
    // IMAGE GENERATION
    // ══════════════════════════════════════════════
    async generateImage(prompt) {
        if (!this.backendOnline) { this.addMsg('⚠️ Backend needed for image generation.', 'ai'); return; }
        this.addMsg('🎨 Generating image: "' + prompt + '"', 'ai');
        this.speak('Generating image, please wait');
        this.setStatus('Generating…', 'processing');
        var typing = this.showTyping();
        try {
            var d = await this.api('/api/image/generate', 'POST', { prompt: prompt });
            typing.remove();
            if (d.success && d.url) {
                var wrap = document.createElement('div');
                wrap.className = 'ai-message';
                wrap.innerHTML = '<i class="fas fa-robot"></i><div class="msg-content"><p>🎨 Generated image:</p>' +
                    '<img src="' + d.url + '" style="max-width:100%;border-radius:12px;margin-top:8px;cursor:pointer" ' +
                    'onclick="window.open(\'' + d.url + '\',\'_blank\')" alt="Generated Image">' +
                    '<a href="' + d.url + '" download="elsa_image.png" style="display:block;margin-top:8px;color:#0ff">⬇ Download</a></div>';
                var msgs = document.getElementById('messages');
                if (msgs) msgs.appendChild(wrap);
                this.scrollToBottom();
                this.speak('Image generated!');
            } else {
                this.addMsg('❌ ' + (d.message || 'Failed to generate image'), 'ai');
            }
        } catch (e) { typing.remove();
            this.addMsg('❌ Image error: ' + e.message, 'ai'); }
        this.setStatus('Ready', 'ready');
    }

    // ══════════════════════════════════════════════
    // AI CHAT
    // ══════════════════════════════════════════════
    async chatWithAI(message) {
        if (!this.backendOnline) {
            this.addMsg('⚠️ Backend offline. Start: python backend_ultra_advanced_FIXED.py', 'ai');
            this.speak('Backend is offline. Please start the backend server.');
            this.setStatus('Ready', 'ready');
            return;
        }
        var typing = this.showTyping();
        try {
            var d = await this.api('/api/chat', 'POST', { message: message, model: this.activeModel });
            typing.remove();
            if (d.success) {
                this.addMsg(d.response, 'ai', d.model);
                if (this.voiceReplyEnabled) this.speak(d.response);
            } else {
                this.addMsg('⚠️ ' + (d.error || 'Unknown error'), 'ai');
            }
        } catch (e) {
            typing.remove();
            this.addMsg('❌ Connection error: ' + e.message, 'ai');
        }
        this.setStatus('Ready', 'ready');
    }

    // ══════════════════════════════════════════════
    // SEND MESSAGE
    // ══════════════════════════════════════════════
    sendMessage() {
        var inp = document.getElementById('textInput');
        var msg = inp ? inp.value.trim() : '';
        if (!msg) return;
        if (inp) inp.value = '';
        this.autoResize(inp);
        this.addMsg(msg, 'user');
        this.handleCommand(msg.toLowerCase(), msg);
    }

    handleKey(e) {
        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault();
            this.sendMessage(); }
    }

    autoResize(el) {
        if (!el) return;
        el.style.height = 'auto';
        el.style.height = Math.min(el.scrollHeight, 150) + 'px';
    }

    // ══════════════════════════════════════════════
    // FILE UPLOADS
    // ══════════════════════════════════════════════
    handleImageUpload(e) {
        var files = Array.from(e.target.files);
        var self = this;
        files.forEach(function(f) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                self.attachedImages.push({ name: f.name, data: ev.target.result });
                self.updateAttachmentPreview();
                self.addMsg('📷 Image attached: ' + f.name, 'user');
            };
            reader.readAsDataURL(f);
        });
        e.target.value = '';
    }

    handleDocUpload(e) {
        var files = Array.from(e.target.files);
        var self = this;
        files.forEach(function(f) {
            var reader = new FileReader();
            reader.onload = function(ev) {
                self.attachedDocs.push({ name: f.name, content: ev.target.result });
                self.updateAttachmentPreview();
                self.addMsg('📄 Document attached: ' + f.name, 'user');
            };
            reader.readAsText(f);
        });
        e.target.value = '';
    }

    updateAttachmentPreview() {
        var prev = document.getElementById('attachmentPreview');
        if (!prev) return;
        prev.innerHTML = '';
        var all = this.attachedImages.concat(this.attachedDocs);
        for (var i = 0; i < all.length; i++) {
            var chip = document.createElement('div');
            chip.className = 'attach-chip';
            chip.innerHTML = '<span>' + all[i].name + '</span><button onclick="elsa.removeAttachment(' + i + ')">×</button>';
            prev.appendChild(chip);
        }
    }

    removeAttachment(i) {
        if (i < this.attachedImages.length) this.attachedImages.splice(i, 1);
        else this.attachedDocs.splice(i - this.attachedImages.length, 1);
        this.updateAttachmentPreview();
    }

    // ══════════════════════════════════════════════
    // WAVEFORM
    // ══════════════════════════════════════════════
    setupWaveform() {
        var canvas = document.getElementById('waveform');
        if (!canvas) return;
        this.waveCtx = canvas.getContext('2d');
        canvas.width = (canvas.parentElement ? canvas.parentElement.offsetWidth : 300) || 300;
        canvas.height = 50;
        var self = this;
        var animate = function() {
            var ctx = self.waveCtx;
            var w = canvas.width,
                h = canvas.height;
            ctx.clearRect(0, 0, w, h);
            var bars = 60,
                bw = w / bars;
            for (var i = 0; i < bars; i++) {
                var amp = self.isListening ? Math.random() : (0.25 + Math.sin(Date.now() * 0.002 + i * 0.3) * 0.2);
                var barH = amp * h * 0.85 + 2;
                var grad = ctx.createLinearGradient(0, 0, 0, h);
                grad.addColorStop(0, self.isListening ? '#ff2fff' : '#00fff9');
                grad.addColorStop(1, self.isListening ? '#ff0077' : '#0050ff');
                ctx.fillStyle = grad;
                ctx.beginPath();
                if (ctx.roundRect) ctx.roundRect(i * bw + 1, (h - barH) / 2, bw - 2, barH, 2);
                else ctx.rect(i * bw + 1, (h - barH) / 2, bw - 2, barH);
                ctx.fill();
            }
            requestAnimationFrame(animate);
        };
        animate();
    }

    // ══════════════════════════════════════════════
    // UI HELPERS
    // ══════════════════════════════════════════════
    addMsg(text, type, model) {
        var msgs = document.getElementById('messages');
        var welcome = document.getElementById('welcomeScreen');
        if (welcome) welcome.style.display = 'none';
        if (!msgs) return { remove: function() {} };

        var div = document.createElement('div');
        div.className = type + '-message';

        var icon = document.createElement('i');
        icon.className = type === 'user' ? 'fas fa-user' : type === 'system' ? 'fas fa-cog' : 'fas fa-robot';
        div.appendChild(icon);

        var content = document.createElement('div');
        content.className = 'msg-content';
        content.innerHTML = this.renderText(text);

        if (model) {
            var tag = document.createElement('small');
            tag.className = 'model-tag';
            tag.innerHTML = '<i class="fas fa-microchip"></i> ' + model;
            content.appendChild(tag);
        }

        var ts = document.createElement('small');
        ts.className = 'msg-time';
        ts.textContent = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        content.appendChild(ts);

        if (type === 'ai') {
            var copyBtn = document.createElement('button');
            copyBtn.className = 'copy-msg-btn';
            copyBtn.innerHTML = '<i class="fas fa-copy"></i>';
            copyBtn.title = 'Copy';
            var textCopy = text;
            copyBtn.onclick = function() { navigator.clipboard.writeText(textCopy); };
            content.appendChild(copyBtn);
        }

        div.appendChild(content);
        msgs.appendChild(div);
        this.scrollToBottom();
        return div;
    }

    renderText(text) {
        return text
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
            .replace(/```([\s\S]+?)```/g, '<pre><code>$1</code></pre>')
            .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
            .replace(/\*(.+?)\*/g, '<em>$1</em>')
            .replace(/`(.+?)`/g, '<code>$1</code>')
            .replace(/^#{1,3}\s+(.+)$/gm, '<h4>$1</h4>')
            .replace(/\n/g, '<br>');
    }

    showTyping() {
        var msgs = document.getElementById('messages');
        if (!msgs) return { remove: function() {} };
        var div = document.createElement('div');
        div.className = 'ai-message typing-indicator';
        div.innerHTML = '<i class="fas fa-robot"></i><div class="msg-content"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div>';
        msgs.appendChild(div);
        this.scrollToBottom();
        return div;
    }

    scrollToBottom() {
        var msgs = document.getElementById('messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
        var area = document.getElementById('conversationArea');
        if (area) area.scrollTop = area.scrollHeight;
    }

    setStatus(text, type) {
        var dot = document.querySelector('.status-dot');
        var txt = document.getElementById('statusText');
        if (txt) txt.textContent = text;
        if (dot) {
            var colors = { ready: '#00ff41', listening: '#00fff9', processing: '#ffdd00', error: '#ff0055' };
            var c = colors[type] || colors.ready;
            dot.style.background = c;
            dot.style.boxShadow = '0 0 10px ' + c;
        }
    }

    showToast(msg, type) {
        type = type || 'info';
        var toast = document.getElementById('toastContainer');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'toastContainer';
            toast.style.cssText = 'position:fixed;bottom:90px;right:24px;z-index:9999;display:flex;flex-direction:column;gap:8px;pointer-events:none;';
            document.body.appendChild(toast);
        }
        var t = document.createElement('div');
        var colors = { success: '#0f0', error: '#f44', warning: '#fa0', info: '#0ff' };
        var c = colors[type] || colors.info;
        t.style.cssText = 'background:rgba(0,0,0,0.9);border:1px solid ' + c + ';color:#fff;padding:10px 18px;border-radius:8px;font-size:14px;backdrop-filter:blur(10px);box-shadow:0 0 15px ' + c + '44;max-width:320px;pointer-events:none;';
        t.textContent = msg;
        toast.appendChild(t);
        setTimeout(function() {
            t.style.opacity = '0';
            t.style.transition = 'opacity 0.5s';
            setTimeout(function() { t.remove(); }, 500);
        }, 3000);
    }

    // ══════════════════════════════════════════════
    // PANELS & MODALS
    // ══════════════════════════════════════════════
    showPanel(id) { var p = document.getElementById(id); if (p) p.classList.add('active'); }
    closePanel(id) { var p = document.getElementById(id); if (p) p.classList.remove('active'); }
    showAppsPanel() { this.showPanel('appsPanel'); }
    showSearchPanel() { this.showPanel('searchPanel'); }

    // ══════════════════════════════════════════════
    // MODEL & FEATURE CONTROLS
    // ══════════════════════════════════════════════
    setModel(model, el) {
        this.activeModel = model;
        document.querySelectorAll('.model-card').forEach(function(c) { c.classList.remove('active'); });
        if (el) el.classList.add('active');
        var chip = document.getElementById('currentModelName');
        var names = { auto: 'Auto', claude: 'Claude', gpt: 'GPT-4o', gemini: 'Gemini' };
        if (chip) chip.textContent = names[model] || model;
        this.showToast('Model: ' + (names[model] || model), 'info');
    }

    toggleFeature(feature, el) {
        var map = { vision: 'visionEnabled', voiceReply: 'voiceReplyEnabled', context: 'contextEnabled', auto: 'autoActionEnabled' };
        if (map[feature]) {
            this[map[feature]] = !this[map[feature]];
            el.classList.toggle('on', this[map[feature]]);
            this.showToast(feature + ': ' + (this[map[feature]] ? 'ON' : 'OFF'), 'info');
        }
    }

    // ══════════════════════════════════════════════
    // QUICK ACTIONS
    // ══════════════════════════════════════════════
    quickAction(action) {
        var self = this;
        var map = {
            time: function() { var t = new Date().toLocaleTimeString();
                self.addMsg('🕐 Current time: ' + t, 'ai');
                self.speak('The time is ' + t); },
            weather: function() { window.open('https://www.google.com/search?q=weather+today', '_blank');
                self.addMsg('🌦️ Opening weather...', 'ai');
                self.speak('Opening weather'); },
            news: function() { window.open('https://news.google.com', '_blank');
                self.addMsg('📰 Opening Google News...', 'ai'); },
            music: function() { window.open('https://open.spotify.com', '_blank');
                self.addMsg('🎵 Opening Spotify...', 'ai');
                self.speak('Opening Spotify'); },
            screenshot: function() { self.doScreenshot(); },
            sysinfo: function() { self.showSysInfo(); },
            clear: function() { self.clearChat(); },
            shutdown_menu: function() { self.showPanel('powerPanel'); },
            record: function() { self.toggleScreenRecord(); },
        };
        if (map[action]) map[action]();
    }

    // ══════════════════════════════════════════════
    // POWER ACTIONS
    // ══════════════════════════════════════════════
    async powerAction(action) {
        this.closePanel('powerPanel');
        if (!this.backendOnline && action !== 'cancel') {
            this.addMsg('⚠️ Backend needed for power actions.', 'ai');
            return;
        }
        var cmds = {
            shutdown: { action: 'shutdown', params: { delay: 5 } },
            restart: { action: 'restart', params: { delay: 5 } },
            sleep: { action: 'sleep', params: {} },
            lock: { action: 'lock_screen', params: {} },
            cancel: { action: 'cancel_shutdown', params: {} }
        };
        var cmd = cmds[action];
        if (!cmd) return;
        try {
            var d = await this.api('/api/command', 'POST', cmd);
            this.addMsg(d.message || '✅ ' + action, 'ai');
            this.speak(d.message || action);
        } catch (e) { this.addMsg('❌ Power action failed: ' + e.message, 'ai'); }
    }

    // ══════════════════════════════════════════════
    // SEARCH ENGINE PANEL
    // ══════════════════════════════════════════════
    searchEngine(engine) {
        var searchEl = document.getElementById('searchQuery');
        var q = searchEl && searchEl.value ? searchEl.value.trim() : '';
        if (!q) return;
        var urls = {
            google: 'https://www.google.com/search?q=' + encodeURIComponent(q),
            wikipedia: 'https://en.wikipedia.org/wiki/Special:Search?search=' + encodeURIComponent(q),
            youtube: 'https://www.youtube.com/results?search_query=' + encodeURIComponent(q),
            edge: 'https://www.bing.com/search?q=' + encodeURIComponent(q),
            chatgpt: 'https://chatgpt.com/?q=' + encodeURIComponent(q),
            claude: 'https://claude.ai'
        };
        window.open(urls[engine] || urls.google, '_blank');
        this.closePanel('searchPanel');
        this.addMsg('🔍 Searched ' + engine + ' for: ' + q, 'ai');
    }

    // ══════════════════════════════════════════════
    // MISC
    // ══════════════════════════════════════════════
    clearChat() {
        var msgs = document.getElementById('messages');
        if (msgs) msgs.innerHTML = '';
        var welcome = document.getElementById('welcomeScreen');
        if (welcome) welcome.style.display = '';
        if (this.backendOnline) this.api('/api/clear', 'POST').catch(function() {});
        this.addMsg('Chat cleared. How can I help you?', 'ai');
        this.showToast('Chat cleared', 'info');
    }

    loadSuggestion(el) {
        var spanEl = el.querySelector('span');
        var text = spanEl && spanEl.textContent ? spanEl.textContent.replace(/['"]/g, '') : '';
        var inp = document.getElementById('textInput');
        if (inp) { inp.value = text;
            inp.focus(); }
        this.sendMessage();
    }

    saveSettings() { localStorage.setItem('elsa4-settings', JSON.stringify(this.settings)); }
}

// ══════════════════════════════════════════════════
// BOOT
// ══════════════════════════════════════════════════
window.addEventListener('DOMContentLoaded', function() {
    if ('speechSynthesis' in window) speechSynthesis.getVoices();
    window.elsa = new ElsaUltraAI();
});

window.addEventListener('beforeunload', function() {
    if (window.elsa) window.elsa.saveSettings();
});