/**
 * VendeeX i18n — Internationalisation module
 * Demo-only Chinese language toggle.
 * Self-initialising: injects the flag toggle into .nav-container,
 * applies translations on load, persists preference in localStorage.
 *
 * Usage: add one script tag to any page:
 *   <script src="js/i18n.js"></script>       (root-level pages)
 *   <script src="../js/i18n.js"></script>     (pages/ subdirectory)
 *
 * Keys are applied via data-i18n="key" on elements.
 * Placeholder keys: data-i18n-placeholder="key"
 */

(function () {
  'use strict';

  // ─── Translation strings ─────────────────────────────────────────────────────

  var STRINGS = {

    en: {
      // Shared banner
      'banner.poc':  'Agentic Commerce Proof of Concept',
      'banner.sub':  'Experience an AI buying agent that works exclusively for you',

      // Shared nav
      'nav.home':         'Home',
      'nav.tryDemo':      'Try Demo',
      'nav.howItWorks':   'How It Works',
      'nav.merchants':    'Merchants',
      'nav.login':        'Login',
      'nav.getStarted':   'Get Started',
      'nav.newSearch':    'New Search',

      // Shared info banner labels
      'info.happening': 'What is happening',
      'info.matters':   'Why it matters',
      'info.cando':     'What you can do',
      'info.canDo':     'What you can do',

      // Shared footer
      'footer.contact': 'Contact Us',
      'footer.demo':    'DEMONSTRATION VERSION',

      // ── index.html ──────────────────────────────────────────────────────────
      'index.happening.p':   'You are about to experience an AI buying agent that works exclusively for you.',
      'index.matters.p':     'Unlike marketplaces, this agent has no seller incentives. It represents your interests only.',
      'index.cando.p':       'Create your Avatar for personalised results, or sign in to continue searching.',
      'index.powered':       'Powered by Agentic Commerce Trust Infrastructure (ACTIF)',
      'index.createTitle':   'Create Your Avatar',
      'index.createDesc':    'Personalised results, shipping calculations, and buy-local preferences. Takes 30 seconds.',
      'index.createBtn':     'Create Avatar',
      'index.or':            'or',
      'index.returningTitle':'Returning Member',
      'index.returningDesc': 'Ready to search for more products? Do you need to modify your avatar preferences?',
      'index.loginBtn':      'Login &amp; Search',
      'index.stat1':         'Products Searchable',
      'index.stat2':         'Vendors Connected',
      'index.stat3':         'Buyer Sovereignty',
      'index.footerTag':     'VendeeX is open infrastructure for trusted agentic commerce — available to any organisation. White-label a buyer-sovereign AI agent on the VendeeX platform. Your agent works exclusively for you.',
      'index.pocTag':        'AGENTIC COMMERCE PROOF OF CONCEPT',

      // ── pages/demo.html ─────────────────────────────────────────────────────
      'demo.happening.p':   'Your agent is listening. It will search across a billion products to find the best matches for your needs.',
      'demo.matters.p':     'A smarter conversation now means better results later. The agent reasons about your request before acting.',
      'demo.cando.p':       'Describe what you want to buy in natural language. Refine results through the chat after searching.',
      'demo.heroTitle':     'Experience VendeeX AI',
      'demo.heroSub':       'Describe what you\'re looking for, and watch our AI find the perfect matches',
      'demo.searchLabel':   'What are you looking for?',
      'demo.searchDesc':    'Describe your ideal product in natural language. Include details like budget, features, and preferences.',
      'demo.findBtn':       'Find Products',
      'demo.editAvatar':    '⚙ Edit Avatar',
      'demo.examples':      'Try these examples',
      'demo.ex1':           'Workout Wardrobe Refresh',
      'demo.ex2':           'Laptop for Travel',
      'demo.ex3':           'Sustainable Basics',
      'demo.ex4':           'New Bedroom Setup',
      'demo.ex5':           'Robot Vacuum',
      'demo.agentTitle':    'Your Agent is Listening',
      'demo.agentSub':      'Answer a few quick questions so your agent can find exactly what you need.',
      'demo.sendBtn':       'Send',
      'demo.skipBtn':       'Skip — search now',
      'demo.searchingTitle':'AI Agents are Searching...',
      'demo.searchingSub':  'Finding the perfect match for your request',
      'demo.resultsTitle':  'Your Curated Recommendations',
      'demo.resultsFound':  'Found',
      'demo.resultsSuffix': 'products matching your criteria',
      'demo.aiAnalysis':    'VendeeX AI Analysis',
      'demo.shipping':      'Shipping:',
      'demo.standard':      'Standard',
      'demo.express':       'Express',
      'demo.refineBtn':     'Refine My Search',
      'qualify.inputPH':    'Type your answer...',
      'qualify.searchNow':  'Search Now',

      // ── pages/login.html ────────────────────────────────────────────────────
      'login.happening.p': 'Sign in to restore your Vendee Avatar and continue your personalised buying experience.',
      'login.matters.p':   'Your avatar remembers your preferences, location, and buy-local settings so your agent can work smarter.',
      'login.cando.p':     'Enter your email to restore your avatar, or start searching without signing in.',
      'login.title':       'Welcome Back',
      'login.sub':         'Sign in to continue your smart buying journey',
      'login.googleBtn':   'Continue with Google',
      'login.githubBtn':   'Continue with GitHub',
      'login.orEmail':     'or sign in with email',
      'login.emailPH':     'Email Address',
      'login.emailInputPH':'Enter the email you registered with',
      'login.restoreBtn':  'Restore My Avatar',
      'login.noAccount':   'Don\'t have an account?',
      'login.signup':      'Sign up for free',
      'login.demoNote':    'This is a demonstration. No data is stored.',

      // ── register.html ───────────────────────────────────────────────────────
      'reg.info.happening': 'You are creating your Vendee Avatar — a persistent digital identity that shapes how your autonomous agent shops for you.',
      'reg.info.matters':   'Your avatar tells your agent who you are, what you value, and how you like to shop. It enforces your preferences automatically.',
      'reg.info.canDo':     'Complete two short steps: identify yourself, then set your values and preferences. Takes under a minute.',
      'reg.title':          'Create Your Vendee Avatar',
      'reg.credential':     'VendeeX never stores your personal documents or payment methods. Your Avatar carries a W3C Verifiable Credential, signed with Ed25519, that proves who you are without needing to keep copies of any personally identifying documents or payment credentials.',
      'reg.step1.heading':          'Who is your Avatar representing?',
      'reg.step1.personal.label':   'Personal Shopper',
      'reg.step1.personal.desc':    'Your agent shops for you personally',
      'reg.step1.business.label':   'Business Entity',
      'reg.step1.business.desc':    'Your agent acts on behalf of your organisation',
      'reg.step1.gov.label':        'Government Agency',
      'reg.step1.gov.desc':         'Your agent operates within public procurement rules',
      'reg.step1.continue':         'Continue to Preferences',
      'reg.step2.desc':   'Your Avatar is your persistent digital identity. It tells your agent what values need to be applied to every purchase decision. You set these global preferences on setup only. Although you can tweak them at any time. Once set they are applied against all your product searches.',
      'reg.step2.title':  'Set your preferences',
      'reg.step2.back':   'Back',
      'reg.step2.create': 'Create My Avatar',
      'reg.success.title':'Avatar Created',
      'reg.success.search':'Start Searching',

      // ── pages/demo.html — search controls panel (buyer-policies.js) ─────────
      'demo.ctrlTitle':   'Search Controls',
      'demo.ctrlBadge':   'Per-search overrides',
      'demo.budget':      'Budget',
      'demo.budgetPH':    'No limit',
      'demo.freeReturns': 'Free Returns',
      'demo.avatarPref':  '(from your Avatar)',
      'demo.maxDelivery': 'Max Delivery Days',
      'demo.customRule':  'Custom Rule',
      'demo.customRulePH':'e.g. No fast fashion',
      'reg.footer.copyright': '© 2026 Vendee Labs Limited. All rights reserved.',
      'reg.footer.privacy':   'Privacy Notice',
    },

    zh: {
      // Shared banner
      'banner.poc':  '代理商务概念验证',
      'banner.sub':  '体验专为您服务的AI购物代理',

      // Shared nav
      'nav.home':         '首页',
      'nav.tryDemo':      '体验演示',
      'nav.howItWorks':   '运作方式',
      'nav.merchants':    '商家',
      'nav.login':        '登录',
      'nav.getStarted':   '立即开始',
      'nav.newSearch':    '新搜索',

      // Shared info banner labels
      'info.happening': '正在发生什么',
      'info.matters':   '为什么重要',
      'info.cando':     '您可以做什么',
      'info.canDo':     '您可以做什么',

      // Shared footer
      'footer.contact': '联系我们',
      'footer.demo':    '演示版本',

      // ── index.html ──────────────────────────────────────────────────────────
      'index.happening.p':   '您即将体验一个专为您服务的AI购物代理。',
      'index.matters.p':     '与电商平台不同，这个代理没有卖家激励。它只代表您的利益。',
      'index.cando.p':       '创建您的数字分身以获得个性化结果，或登录继续搜索。',
      'index.powered':       '由代理商务信任基础设施（ACTIF）驱动',
      'index.createTitle':   '创建您的数字分身',
      'index.createDesc':    '个性化结果、运费计算和本地优先购物偏好。仅需30秒。',
      'index.createBtn':     '创建数字分身',
      'index.or':            '或',
      'index.returningTitle':'老用户登录',
      'index.returningDesc': '准备搜索更多产品？需要修改您的数字分身偏好吗？',
      'index.loginBtn':      '登录并搜索',
      'index.stat1':         '可搜索产品',
      'index.stat2':         '接入商家',
      'index.stat3':         '买家主权',
      'index.footerTag':     'VendeeX是受信任代理商务的开放基础设施，任何组织均可采用。在VendeeX平台上部署以买家为核心的白标AI代理。您的代理专为您服务。',
      'index.pocTag':        '代理商务概念验证',

      // ── pages/demo.html ─────────────────────────────────────────────────────
      'demo.happening.p':   '您的代理正在聆听。它将在十亿件产品中搜索，为您找到最佳匹配。',
      'demo.matters.p':     '更智能的对话意味着更好的结果。代理在行动前会充分理解您的需求。',
      'demo.cando.p':       '用自然语言描述您想购买的商品。搜索后通过对话精细化结果。',
      'demo.heroTitle':     '体验VendeeX AI',
      'demo.heroSub':       '描述您在寻找什么，看我们的AI为您找到完美匹配',
      'demo.searchLabel':   '您在寻找什么？',
      'demo.searchDesc':    '用自然语言描述您理想的产品，包括预算、功能和偏好等详情。',
      'demo.findBtn':       '查找产品',
      'demo.editAvatar':    '⚙ 编辑数字分身',
      'demo.examples':      '试试这些示例',
      'demo.ex1':           '运动衣橱更新',
      'demo.ex2':           '出行笔记本',
      'demo.ex3':           '可持续基础款',
      'demo.ex4':           '全新卧室布置',
      'demo.ex5':           '扫地机器人',
      'demo.agentTitle':    '您的代理正在聆听',
      'demo.agentSub':      '回答几个简短问题，让您的代理找到您真正需要的。',
      'demo.sendBtn':       '发送',
      'demo.skipBtn':       '跳过 — 直接搜索',
      'demo.searchingTitle':'AI代理正在搜索...',
      'demo.searchingSub':  '正在为您的请求寻找最佳匹配',
      'demo.resultsTitle':  '为您精选的推荐',
      'demo.resultsFound':  '找到',
      'demo.resultsSuffix': '件符合您条件的产品',
      'demo.aiAnalysis':    'VendeeX AI分析',
      'demo.shipping':      '配送方式：',
      'demo.standard':      '标准配送',
      'demo.express':       '快速配送',
      'demo.refineBtn':     '精细化我的搜索',
      'qualify.inputPH':    '请输入您的回答...',
      'qualify.searchNow':  '立即搜索',

      // ── pages/login.html ────────────────────────────────────────────────────
      'login.happening.p': '登录以恢复您的Vendee数字分身并继续个性化购物体验。',
      'login.matters.p':   '您的数字分身会记住您的偏好、位置和本地购物设置，让您的代理工作得更智能。',
      'login.cando.p':     '输入您的邮箱恢复数字分身，或直接开始搜索无需登录。',
      'login.title':       '欢迎回来',
      'login.sub':         '登录继续您的智能购物旅程',
      'login.googleBtn':   '通过Google继续',
      'login.githubBtn':   '通过GitHub继续',
      'login.orEmail':     '或通过邮箱登录',
      'login.emailPH':     '电子邮件地址',
      'login.emailInputPH':'请输入您注册时使用的邮箱',
      'login.restoreBtn':  '恢复我的数字分身',
      'login.noAccount':   '还没有账户？',
      'login.signup':      '免费注册',
      'login.demoNote':    '这是一个演示。不会存储任何数据。',

      // ── register.html ───────────────────────────────────────────────────────
      'reg.info.happening': '您正在创建您的Vendee数字分身 — 一个持久的数字身份，决定您的自主代理如何为您购物。',
      'reg.info.matters':   '您的数字分身告诉代理您是谁、您重视什么、以及您喜欢的购物方式。它会自动执行您的偏好。',
      'reg.info.canDo':     '完成两个简短步骤：确认身份，然后设置您的价值观和偏好。不到一分钟即可完成。',
      'reg.title':          '创建您的Vendee数字分身',
      'reg.credential':     'VendeeX从不存储您的个人文件或支付方式。您的数字分身携带符合W3C标准的可验证凭证，使用Ed25519签名，无需保存任何个人身份文件或支付凭证副本即可证明您的身份。',
      'reg.step1.heading':          '您的数字分身代表谁？',
      'reg.step1.personal.label':   '个人购物者',
      'reg.step1.personal.desc':    '您的代理为您个人购物',
      'reg.step1.business.label':   '商业实体',
      'reg.step1.business.desc':    '您的代理代表您的组织行事',
      'reg.step1.gov.label':        '政府机构',
      'reg.step1.gov.desc':         '您的代理在公共采购规则范围内运作',
      'reg.step1.continue':         '继续设置偏好',
      'reg.step2.desc':   '您的数字分身是您持久的数字身份。它告诉代理需要将哪些价值观应用于每项采购决策。您仅在设置时配置这些全局偏好，但可随时调整。一旦设置，它们将应用于您所有的产品搜索。',
      'reg.step2.title':  '设置您的偏好',
      'reg.step2.back':   '返回',
      'reg.step2.create': '创建我的数字分身',
      'reg.success.title':'数字分身已创建',
      'reg.success.search':'开始搜索',

      // ── search controls (buyer-policies.js) ────────────────────────────────
      'demo.ctrlTitle':   '搜索控制',
      'demo.ctrlBadge':   '单次搜索覆盖',
      'demo.budget':      '预算',
      'demo.budgetPH':    '不限',
      'demo.freeReturns': '免费退货',
      'demo.avatarPref':  '（来自您的数字分身）',
      'demo.maxDelivery': '最长配送天数',
      'demo.customRule':  '自定义规则',
      'demo.customRulePH':'例：不要快时尚',
      'reg.footer.copyright': '© 2026 Vendee Labs Limited。保留所有权利。',
      'reg.footer.privacy':   '隐私声明',
    }
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────────

  function getLang() {
    return localStorage.getItem('vx-lang') || 'en';
  }

  function setLang(code) {
    localStorage.setItem('vx-lang', code);
  }

  function applyTranslations(lang) {
    var dict = STRINGS[lang] || STRINGS['en'];

    // Text content — skip elements marked data-i18n-dynamic or that carry live search state
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      if (el.hasAttribute('data-i18n-dynamic')) return;
      if (el.id === 'searchQueryDisplay') return;
      var key = el.getAttribute('data-i18n');
      if (dict[key] !== undefined) {
        el.innerHTML = dict[key];
      }
    });

    // Placeholder attributes
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var key = el.getAttribute('data-i18n-placeholder');
      if (dict[key] !== undefined) {
        el.setAttribute('placeholder', dict[key]);
      }
    });

    // Update html lang attribute
    document.documentElement.setAttribute('lang', lang === 'zh' ? 'zh-Hans' : 'en');

    // Update toggle button appearance
    var btn = document.getElementById('vx-lang-toggle');
    if (btn) {
      btn.innerHTML = lang === 'zh'
        ? '<span class="vx-flag">🇬🇧</span><span class="vx-lang-label">EN</span>'
        : '<span class="vx-flag">🇨🇳</span><span class="vx-lang-label">中文</span>';
      btn.setAttribute('aria-label', lang === 'zh' ? 'Switch to English' : '切换到中文');
    }
  }

  // ─── Inject toggle into navbar ───────────────────────────────────────────────

  function injectToggle() {
    var container = document.querySelector('.nav-container');
    if (!container) return;

    // Avoid double-injection
    if (document.getElementById('vx-lang-toggle')) return;

    var btn = document.createElement('button');
    btn.id = 'vx-lang-toggle';
    btn.type = 'button';
    btn.setAttribute('aria-label', 'Switch language');
    btn.style.cssText = [
      'display:inline-flex',
      'align-items:center',
      'gap:4px',
      'padding:5px 10px',
      'border:1px solid rgba(33,82,116,0.25)',
      'border-radius:6px',
      'background:transparent',
      'cursor:pointer',
      'font-size:0.8125rem',
      'font-weight:600',
      'color:#215274',
      'font-family:inherit',
      'transition:background 0.2s,border-color 0.2s',
      'margin-left:8px',
      'white-space:nowrap',
      'flex-shrink:0'
    ].join(';');

    btn.addEventListener('mouseenter', function () {
      this.style.background = 'rgba(33,82,116,0.06)';
      this.style.borderColor = '#215274';
    });
    btn.addEventListener('mouseleave', function () {
      this.style.background = 'transparent';
      this.style.borderColor = 'rgba(33,82,116,0.25)';
    });

    btn.addEventListener('click', function () {
      var current = getLang();
      var next = current === 'zh' ? 'en' : 'zh';
      setLang(next);
      applyTranslations(next);
    });

    // Insert before mobile-menu-btn if present, else append
    var mobileBtn = container.querySelector('.mobile-menu-btn');
    if (mobileBtn) {
      container.insertBefore(btn, mobileBtn);
    } else {
      container.appendChild(btn);
    }
  }


  // ─── Expose window.t for dynamically-rendered components (e.g. buyer-policies.js) ─
  window.t = function (key) {
    var dict = STRINGS[getLang()] || STRINGS['en'];
    return dict[key] !== undefined ? dict[key] : key;
  };

  // ─── Expose lang getter for other modules (e.g. qualifying-chat.js) ──────────
  window.VX_LANG = {
    get: getLang,
    set: setLang
  };

  // ─── Initialise ──────────────────────────────────────────────────────────────

  function init() {
    injectToggle();
    applyTranslations(getLang());
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
