// Browser speech is optional: never substitute an English voice for Chinese.
(function (root) {
  try { root.speechSynthesis?.getVoices(); } catch {}
  function createReader({ synth, Utterance, status, highlight, controls, rate, setTimer = setTimeout, clearTimer = clearTimeout }) {
    let session = 0;
    let active = null;
    let timer = null;
    let waitingForVoice = false;
    function stop(message = '') {
      session++;
      waitingForVoice = false;
      clearTimer(timer);
      timer = null;
      if (active) active.onstart = active.onend = active.onerror = null;
      active = null;
      try { synth?.cancel(); } catch {}
      controls(false);
      highlight(null);
      status(message);
    }
    function chineseVoice() {
      const voices = synth.getVoices() || [];
      const chinese = voices.filter(v => /^(zh|cmn)([-_]|$)/i.test(v.lang || ''));
      return chinese.find(v => /^(zh[-_](CN|Hans)|cmn)/i.test(v.lang)) ||
        chinese.find(v => /^zh[-_](TW|Hant)/i.test(v.lang)) ||
        chinese.find(v => /^zh$/i.test(v.lang)) || null;
    }
    function start(verses) {
      stop();
      if (!synth || !Utterance) { status('当前浏览器不提供语音朗读，请尝试 Safari。'); return; }
      const readable = (verses || []).filter(v => typeof v.zh === 'string' && v.zh.trim());
      if (!readable.length) { status('本章暂时没有可朗读的中文经文。'); return; }
      let voice;
      try { voice = chineseVoice(); } catch { status('无法读取设备语音，请重新打开页面后重试。'); return; }
      if (!voice) {
        waitingForVoice = true;
        // Do not defer speak() to voiceschanged: iOS can lose the tap permission.
        status('尚未取得普通话语音。请稍等后再次点击朗读；若仍不可用，请在 iPhone 的系统语音设置中添加普通话语音。');
        return;
      }
      const id = session;
      const parts = readable.flatMap(v => {
        const pieces = v.zh.trim().match(/[^。！？；，]{1,100}[。！？；，]?|[。！？；，]/g) || [v.zh];
        return pieces.map(text => ({ verse: v.verse, text }));
      });
      let index = 0;
      controls(true);
      function next() {
        if (id !== session) return;
        if (index === parts.length) { stop('本次朗读已完成。'); return; }
        const part = parts[index++];
        const utterance = new Utterance(part.text);
        active = utterance; // Retain a strong reference throughout playback.
        utterance.voice = voice;
        utterance.lang = voice.lang;
        utterance.volume = 1;
        const requestedRate = Number(rate());
        utterance.rate = Number.isFinite(requestedRate) ? Math.max(0.5, Math.min(2, requestedRate)) : 0.9;
        let began = false;
        let settled = false;
        const current = () => id === session && active === utterance && !settled;
        function fail(code) {
          if (!current()) return;
          settled = true;
          const messages = {
            'not-allowed': '浏览器未允许启动朗读，请保持页面在前台，再次点击朗读。',
            'language-unavailable': '设备没有可用的普通话语音，请添加普通话语音后重试。',
            'voice-unavailable': '所选中文语音暂时不可用，请重新打开页面后重试。',
            'audio-busy': '声音输出被占用，请结束其他通话或播放后重试。',
            'audio-hardware': '声音输出设备不可用，请检查音量和蓝牙连接。',
            'network': '语音服务连接失败，请检查网络后重试。',
            'start-timeout': '朗读未能启动，请检查媒体音量和蓝牙输出，再次点击朗读。',
            'canceled': '朗读被浏览器取消，请再次点击朗读。',
            'interrupted': '朗读被其他声音打断，请再次点击朗读。'
          };
          stop((messages[code] || '设备语音合成失败，请重试或检查系统中文语音。') + `（${code}）`);
        }
        utterance.onstart = () => {
          if (!current()) return;
          began = true;
          clearTimer(timer);
          highlight(part.verse);
          status(`正在朗读第 ${part.verse} 节。若没有声音，请检查媒体音量与蓝牙输出。`);
        };
        utterance.onerror = event => fail(event.error || 'synthesis-failed');
        utterance.onend = () => {
          if (!current()) return;
          if (!began) { fail('start-timeout'); return; }
          settled = true;
          clearTimer(timer);
          active = null;
          next();
        };
        timer = setTimer(() => fail('start-timeout'), 8000);
        try {
          // The first speak() stays synchronous inside the user's tap handler.
          synth.speak(utterance);
          if (synth.paused) synth.resume();
        } catch { fail('synthesis-failed'); }
      }
      status('正在启动中文朗读…');
      next();
    }
    // Warm the voice list, but never autoplay when voices arrive.
    try { synth?.getVoices(); } catch {}
    synth?.addEventListener?.('voiceschanged', () => {
      if (!waitingForVoice) return;
      try {
        if (chineseVoice()) {
          waitingForVoice = false;
          status('普通话语音已就绪，请再次点击朗读。');
        }
      } catch {}
    });
    return { start, stop };
  }
  root.BibleSpeech = { createReader };
})(typeof window === 'undefined' ? globalThis : window);
