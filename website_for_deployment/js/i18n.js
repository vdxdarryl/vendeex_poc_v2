/**
 * VendeeX i18n — English / Simplified Chinese language toggle
 * Auto-injects flag toggle into every navbar.
 * Exposes window.t(key) for JS-injected strings.
 * Persists choice in localStorage as 'vx-lang' = 'en' | 'zh'
 */
(function () {

  var STRINGS = {
    en: {
      /* ── Nav ── */
      'nav.home':           'Home',
      'nav.howItWorks':     'How It Works',
      'nav.tryDemo':        'Try Demo',
      'nav.merchants':      'Merchants',
      'nav.login':          'Login',
      'nav.getStarted':     'Get Started',
      'nav.newSearch':      'New Search',
      'nav.dashboard':      'Dashboard',

      /* ── Demo banner ── */
      'banner.poc':         'Agentic Commerce Proof of Concept',
      'banner.sub':         'Experience an AI buying agent that works exclusively for you',

      /* ── Info strip ── */
      'info.happening':     'What is happening',
      'info.matters':       'Why it matters',
      'info.cando':         'What you can do',

      /* ── Index ── */
      'index.happening.p':  'You are about to experience an AI buying agent that works exclusively for you.',
      'index.matters.p':    'Unlike marketplaces, this agent has no seller incentives. It represents your interests only.',
      'index.cando.p':      'Create your Avatar for personalised results, or sign in to continue searching.',
      'index.powered':      'Powered by Agentic AI + ACP Protocol',
      'index.createTitle':  'Create Your Avatar',
      'index.createDesc':   'Personalised results, shipping calculations, and buy-local preferences. Takes 30 seconds.',
      'index.createBtn':    'Create Avatar',
      'index.or':           'or',
      'index.returningTitle': 'Returning Member',
      'index.returningDesc':  'Ready to search for more products? Do you need to modify your avatar preferences?',
      'index.loginBtn':     'Login & Search',
      'index.stat1':        'Products Searchable',
      'index.stat2':        'Vendors Connected',
      'index.stat3':        'Buyer Sovereignty',
      'index.footerTag':    'VendeeX is the infrastructure layer for agentic commerce. Your AI agent works exclusively for you.',
      'index.pocTag':       'AGENTIC COMMERCE PROOF OF CONCEPT',

      /* ── Demo page ── */
      'demo.happening.p':   'Your agent is listening. It will search across a billion products to find the best matches for your needs.',
      'demo.matters.p':     'A smarter conversation now means better results later. The agent reasons about your request before acting.',
      'demo.cando.p':       'Describe what you want to buy in natural language. Refine results through the chat after searching.',
      'demo.heroTitle':     'Experience VendeeX AI',
      'demo.heroSub':       'Describe what you\'re looking for, and watch our AI find the perfect matches',
      'demo.searchLabel':   'What are you looking for?',
      'demo.editAvatar':    '⚙ Edit Avatar',
      'demo.searchDesc':    'Describe your ideal product in natural language. Include details like budget, features, and preferences.',
      'demo.findBtn':       'Find Products',
      'demo.examples':      'Try these examples',
      'demo.ex1':           'Workout Wardrobe Refresh',
      'demo.ex2':           'Laptop for Travel',
      'demo.ex3':           'Sustainable Basics',
      'demo.ex4':           'New Bedroom Setup',
      'demo.ex5':           'Robot Vacuum',
      'demo.agentTitle':    'Your Agent is Listening',
      'demo.agentSub':      'Answer a few quick questions so your agent can find exactly what you need.',
      'demo.sendBtn':       'Send',
      'demo.skipBtn':       'Skip \u2014 search now',
      'demo.searchingTitle': 'AI Agents are Searching...',
      'demo.searchingSub':  'Finding the perfect match for your request',
      'demo.resultsTitle':  'Your Curated Recommendations',
      'demo.resultsSuffix': 'products matching your criteria',
      'demo.aiAnalysis':    'VendeeX AI Analysis',
      'demo.ctrlTitle':     'Search Controls',
      'demo.ctrlBadge':     'Per-search rules',
      'demo.budget':        'Budget for this search',
      'demo.budgetPH':      'No limit',
      'demo.freeReturns':   'Require free returns',
      'demo.avatarPref':    'Based on your avatar preference',
      'demo.maxDelivery':   'Maximum delivery time',
      'demo.customRule':    'Any specific rules for this search?',
      'demo.customRulePH':  'e.g. \'Only UK sellers\' or \'Must include warranty\'',
      'demo.shipping':      'Shipping:',
      'demo.standard':      'Standard',
      'demo.express':       'Express',

      /* ── Qualifying chat (JS-injected) ── */
      'qualify.searchNow':  'Search Now',
      'qualify.inputPH':    'Type your answer...',

      /* ── Results (JS-injected) ── */
      'result.soldBy':      'Sold by',
      'result.free':        'Free',
      'result.estDelivery': 'Estimated delivery:',
      'result.shipTo':      'Ship to:',
      'result.totalLanded': 'Total Landed Cost',
      'result.effective':   'Effective Cost',
      'result.productPrice':'Product Price',
      'result.addToCart':   'Add to Cart',
      'result.viewDetails': 'View Details',
      'result.toExpensive': 'Too expensive',
      'result.wrongSupplier':'Wrong brand/supplier',
      'result.notRight':    'Not quite right',
      'result.why':         'Why?',
      'result.viewCart':    'View Cart',
      'result.acpCheckout': 'ACP Checkout',
      'result.yourCart':    'Your Cart',
      'result.refine':      'Refine my search',
      'result.allReviewed': 'All results reviewed.',
      'result.dismiss':     'Dismiss',
      'result.viewingAs':   'Viewing as:',
      'result.deliveringTo':'Delivering to:',

      /* ── Login ── */
      'login.happening.p':  'Sign in to restore your Vendee Avatar and continue your personalised buying experience.',
      'login.matters.p':    'Your avatar remembers your preferences, location, and buy-local settings so your agent can work smarter.',
      'login.cando.p':      'Enter your email to restore your avatar, or start searching without signing in.',
      'login.title':        'Welcome Back',
      'login.sub':          'Sign in to continue your smart buying journey',
      'login.orEmail':      'or sign in with email',
      'login.emailPH':      'Email Address',
      'login.signup':       'Sign up for free',

      /* ── Register ── */
      'register.redirecting': 'Redirecting to avatar creation...',
      'register.click':     'Click here if not redirected automatically.',

      /* ── Preferences ── */
      'pref.title':         'Set Up Your Shopping Avatar',
      'pref.sub':           'Help VendeeX AI find exactly what you\'re looking for',
      'pref.econTitle':     'Economic Preferences',
      'pref.econDesc':      'Your budget comfort zone and price sensitivity',
      'pref.budgetZone':    'Budget Comfort Zone',
      'pref.budgetLow':     'Budget-conscious',
      'pref.budgetHigh':    'Premium / Luxury',
      'pref.priceSens':     'Price Sensitivity',
      'pref.priceSensDesc': 'How important is getting the lowest price vs. convenience?',
      'pref.convFirst':     'Convenience first',
      'pref.priceFirst':    'Lowest price always',
      'pref.currency':      'Currency Preference',
      'pref.qualTitle':     'Quality Preferences',
      'pref.qualDesc':      'Your expectations for product quality and brands',
      'pref.qualPriority':  'Quality Priority',
      'pref.qualLow':       'Good enough',
      'pref.qualHigh':      'Best available',
      'pref.brandPref':     'Brand Preference',
      'pref.minRating':     'Minimum Review Rating',
      'pref.ethicsTitle':   'Ethical & Sustainability Preferences',
      'pref.ethicsDesc':    'Your values around sustainability and sourcing',
      'pref.sustainImp':    'Sustainability Importance',
      'pref.sourcing':      'Sourcing Preferences',
      'pref.prioritise':    'Prioritise',
      'pref.prioritiseDesc':'Do you want to prioritise your local community? Support the places that matter to you.',
      'pref.addBtn':        '+ Add',
      'pref.prioritiseHint':'Products from these locations will rank higher in your results.',
      'pref.deprioritise':  'Deprioritise',
      'pref.deprioritiseDesc':'Locations you would rather avoid — but not exclude entirely.',
      'pref.deprioritiseHint':'Products from these locations will rank lower, not be excluded entirely.',
      'pref.convTitle':     'Convenience Preferences',
      'pref.convDesc':      'Delivery speed, returns, and location',
      'pref.delivSpeed':    'Delivery Speed Priority',
      'pref.delivLoc':      'Delivery Location',
      'pref.catTitle':      'Category Interests',
      'pref.catDesc':       'Select categories you\'re interested in shopping',
      'pref.selectAll':     'Select all',
      'pref.clearAll':      'Clear all',
      'pref.saveBtn':       'Save Preferences',
      'pref.skipBtn':       'Skip for Now',
      'pref.saved':         'Preferences saved successfully!',

      /* ── Footer ── */
      'footer.rights':      '© 2026 Vendee Labs Limited. All rights reserved.',
      'footer.demo':        'DEMONSTRATION VERSION',
      'footer.contact':     'Contact Us',
    },

    zh: {
      /* ── Nav ── */
      'nav.home':           '首页',
      'nav.howItWorks':     '如何运作',
      'nav.tryDemo':        '体验演示',
      'nav.merchants':      '商户',
      'nav.login':          '登录',
      'nav.getStarted':     '立即开始',
      'nav.newSearch':      '新搜索',
      'nav.dashboard':      '控制台',

      /* ── Demo banner ── */
      'banner.poc':         '智能商务概念验证',
      'banner.sub':         '体验专为您服务的AI购买代理',

      /* ── Info strip ── */
      'info.happening':     '正在发生什么',
      'info.matters':       '为什么重要',
      'info.cando':         '您可以做什么',

      /* ── Index ── */
      'index.happening.p':  '您即将体验一个专为您服务的AI购买代理。',
      'index.matters.p':    '与普通购物平台不同，此代理没有卖家激励机制，只代表您的利益。',
      'index.cando.p':      '创建您的Avatar获取个性化结果，或登录继续搜索。',
      'index.powered':      '由智能AI + ACP协议驱动',
      'index.createTitle':  '创建您的Avatar',
      'index.createDesc':   '个性化结果、运费计算和本地购买偏好，仅需30秒。',
      'index.createBtn':    '创建Avatar',
      'index.or':           '或',
      'index.returningTitle': '已有账户',
      'index.returningDesc':  '准备搜索更多产品？需要修改您的Avatar偏好吗？',
      'index.loginBtn':     '登录并搜索',
      'index.stat1':        '可搜索产品',
      'index.stat2':        '已连接供应商',
      'index.stat3':        '买家主权',
      'index.footerTag':    'VendeeX是智能商务的基础设施层。您的AI代理专为您服务。',
      'index.pocTag':       '智能商务概念验证',

      /* ── Demo page ── */
      'demo.happening.p':   '您的代理正在聆听，将在十亿件产品中搜索最适合您的选择。',
      'demo.matters.p':     '现在更智能的对话意味着更好的搜索结果。代理在行动前会推理您的需求。',
      'demo.cando.p':       '用自然语言描述您想购买的产品，搜索后通过聊天精炼结果。',
      'demo.heroTitle':     '体验 VendeeX AI',
      'demo.heroSub':       '描述您想要的产品，看我们的AI找到完美匹配',
      'demo.searchLabel':   '您在寻找什么？',
      'demo.editAvatar':    '⚙ 编辑Avatar',
      'demo.searchDesc':    '用自然语言描述您的理想产品，包括预算、功能和偏好等详情。',
      'demo.findBtn':       '查找产品',
      'demo.examples':      '试试这些示例',
      'demo.ex1':           '健身服装更新',
      'demo.ex2':           '出行笔记本',
      'demo.ex3':           '可持续基础款',
      'demo.ex4':           '卧室新布置',
      'demo.ex5':           '扫地机器人',
      'demo.agentTitle':    '您的代理正在聆听',
      'demo.agentSub':      '回答几个简单问题，让您的代理精确找到您需要的产品。',
      'demo.sendBtn':       '发送',
      'demo.skipBtn':       '跳过 \u2014 立即搜索',
      'demo.searchingTitle': 'AI代理正在搜索...',
      'demo.searchingSub':  '正在为您的请求寻找完美匹配',
      'demo.resultsTitle':  '您的精选推荐',
      'demo.resultsSuffix': '个符合条件的产品',
      'demo.aiAnalysis':    'VendeeX AI分析',
      'demo.ctrlTitle':     '搜索控制',
      'demo.ctrlBadge':     '单次搜索规则',
      'demo.budget':        '本次搜索预算',
      'demo.budgetPH':      '无限制',
      'demo.freeReturns':   '要求免费退货',
      'demo.avatarPref':    '基于您的Avatar偏好',
      'demo.maxDelivery':   '最长送货时间',
      'demo.customRule':    '此次搜索有特定规则吗？',
      'demo.customRulePH':  '例如：\'仅限本地卖家\' 或 \'必须含保修\'',
      'demo.shipping':      '配送方式：',
      'demo.standard':      '标准',
      'demo.express':       '快递',

      /* ── Qualifying chat (JS-injected) ── */
      'qualify.searchNow':  '立即搜索',
      'qualify.inputPH':    '输入您的回答...',

      /* ── Results (JS-injected) ── */
      'result.soldBy':      '售卖方：',
      'result.free':        '免费',
      'result.estDelivery': '预计送达：',
      'result.shipTo':      '配送至：',
      'result.totalLanded': '到岸总费用',
      'result.effective':   '实际费用',
      'result.productPrice':'产品价格',
      'result.addToCart':   '加入购物车',
      'result.viewDetails': '查看详情',
      'result.toExpensive': '太贵了',
      'result.wrongSupplier':'品牌/供应商不对',
      'result.notRight':    '不太合适',
      'result.why':         '为什么？',
      'result.viewCart':    '查看购物车',
      'result.acpCheckout': 'ACP结账',
      'result.yourCart':    '您的购物车',
      'result.refine':      '精炼我的搜索',
      'result.allReviewed': '所有结果已审阅。',
      'result.dismiss':     '关闭',
      'result.viewingAs':   '当前查看身份：',
      'result.deliveringTo':'配送至：',

      /* ── Login ── */
      'login.happening.p':  '登录以恢复您的Vendee Avatar并继续个性化购物体验。',
      'login.matters.p':    '您的Avatar记住您的偏好、位置和本地购买设置，让您的代理更智能地工作。',
      'login.cando.p':      '输入您的电子邮件以恢复您的Avatar，或直接开始搜索。',
      'login.title':        '欢迎回来',
      'login.sub':          '登录继续您的智能购物之旅',
      'login.orEmail':      '或通过电子邮件登录',
      'login.emailPH':      '电子邮件地址',
      'login.signup':       '免费注册',

      /* ── Register ── */
      'register.redirecting': '正在跳转到Avatar创建页面...',
      'register.click':     '如未自动跳转，请点击此处。',

      /* ── Preferences ── */
      'pref.title':         '设置您的购物Avatar',
      'pref.sub':           '帮助VendeeX AI精确找到您想要的',
      'pref.econTitle':     '经济偏好',
      'pref.econDesc':      '您的预算舒适区和价格敏感度',
      'pref.budgetZone':    '预算舒适区',
      'pref.budgetLow':     '注重预算',
      'pref.budgetHigh':    '高端/奢侈',
      'pref.priceSens':     '价格敏感度',
      'pref.priceSensDesc': '最低价格与便利性，哪个对您更重要？',
      'pref.convFirst':     '便利优先',
      'pref.priceFirst':    '始终最低价',
      'pref.currency':      '货币偏好',
      'pref.qualTitle':     '质量偏好',
      'pref.qualDesc':      '您对产品质量和品牌的期望',
      'pref.qualPriority':  '质量优先级',
      'pref.qualLow':       '够用即可',
      'pref.qualHigh':      '最佳品质',
      'pref.brandPref':     '品牌偏好',
      'pref.minRating':     '最低评分要求',
      'pref.ethicsTitle':   '道德与可持续性偏好',
      'pref.ethicsDesc':    '您在可持续性和采购方面的价值观',
      'pref.sustainImp':    '可持续性重要性',
      'pref.sourcing':      '采购偏好',
      'pref.prioritise':    '优先',
      'pref.prioritiseDesc':'您想优先支持本地社区吗？支持对您重要的地方。',
      'pref.addBtn':        '+ 添加',
      'pref.prioritiseHint':'来自这些地区的产品将在结果中排名更高。',
      'pref.deprioritise':  '降低优先级',
      'pref.deprioritiseDesc':'您宁愿避免但不完全排除的地区。',
      'pref.deprioritiseHint':'来自这些地区的产品将排名较低，但不会完全排除。',
      'pref.convTitle':     '便利偏好',
      'pref.convDesc':      '送货速度、退货和位置',
      'pref.delivSpeed':    '送货速度优先级',
      'pref.delivLoc':      '配送地址',
      'pref.catTitle':      '品类兴趣',
      'pref.catDesc':       '选择您感兴趣的购物品类',
      'pref.selectAll':     '全选',
      'pref.clearAll':      '清除全部',
      'pref.saveBtn':       '保存偏好',
      'pref.skipBtn':       '暂时跳过',
      'pref.saved':         '偏好保存成功！',

      /* ── Footer ── */
      'footer.rights':      '© 2026 Vendee Labs Limited. 保留所有权利。',
      'footer.demo':        '演示版本',
      'footer.contact':     '联系我们',
    }
  };

  var _lang = localStorage.getItem('vx-lang') || 'en';

  /* ── Public: translate a key ── */
  window.t = function (key) {
    var dict = STRINGS[_lang] || STRINGS['en'];
    return dict[key] || STRINGS['en'][key] || key;
  };

  /* ── Public: get current lang ── */
  window.getLang = function () { return _lang; };

  /* ── Apply translations to DOM ── */
  function applyLang() {
    /* text content */
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      el.textContent = window.t(el.getAttribute('data-i18n'));
    });
    /* placeholders */
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      el.placeholder = window.t(el.getAttribute('data-i18n-placeholder'));
    });
    /* aria-labels */
    document.querySelectorAll('[data-i18n-aria]').forEach(function (el) {
      el.setAttribute('aria-label', window.t(el.getAttribute('data-i18n-aria')));
    });
    /* html lang attribute */
    document.documentElement.lang = _lang === 'zh' ? 'zh-CN' : 'en';
    /* update toggle button label if it exists */
    var toggle = document.getElementById('vx-lang-toggle');
    if (toggle) toggle.setAttribute('title', _lang === 'zh' ? 'Switch to English' : '切换为中文');
  }

  /* ── Inject toggle button into navbar ── */
  function injectToggle() {
    var navLinks = document.querySelector('.nav-links');
    if (!navLinks || document.getElementById('vx-lang-toggle')) return;

    var btn = document.createElement('button');
    btn.id = 'vx-lang-toggle';
    btn.className = 'vx-lang-toggle';
    btn.setAttribute('title', _lang === 'zh' ? 'Switch to English' : '切换为中文');
    btn.innerHTML = _lang === 'zh'
      ? '<span class="vx-flag">&#x1F1E8;&#x1F1F3;</span><span class="vx-lang-label">中文</span>'
      : '<span class="vx-flag">&#x1F1EC;&#x1F1E7;</span><span class="vx-lang-label">EN</span>';

    btn.addEventListener('click', function () {
      _lang = _lang === 'en' ? 'zh' : 'en';
      localStorage.setItem('vx-lang', _lang);
      btn.innerHTML = _lang === 'zh'
        ? '<span class="vx-flag">&#x1F1E8;&#x1F1F3;</span><span class="vx-lang-label">中文</span>'
        : '<span class="vx-flag">&#x1F1EC;&#x1F1E7;</span><span class="vx-lang-label">EN</span>';
      btn.setAttribute('title', _lang === 'zh' ? 'Switch to English' : '切换为中文');
      applyLang();
    });

    navLinks.appendChild(btn);
  }

  /* ── Inject toggle CSS ── */
  function injectCSS() {
    if (document.getElementById('vx-i18n-css')) return;
    var style = document.createElement('style');
    style.id = 'vx-i18n-css';
    style.textContent = [
      '.vx-lang-toggle {',
      '  display:inline-flex; align-items:center; gap:4px;',
      '  background:transparent; border:1px solid rgba(255,255,255,0.3);',
      '  border-radius:6px; padding:4px 8px; cursor:pointer;',
      '  font-size:0.78rem; font-weight:600; color:inherit;',
      '  transition:background 0.15s, border-color 0.15s;',
      '  margin-left:8px; line-height:1;',
      '}',
      '.vx-lang-toggle:hover { background:rgba(0,0,0,0.08); border-color:rgba(0,0,0,0.2); }',
      '.vx-flag { font-size:1rem; line-height:1; }',
      '.vx-lang-label { font-size:0.75rem; }',
    ].join('\n');
    document.head.appendChild(style);
  }

  /* ── Boot ── */
  injectCSS();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      injectToggle();
      applyLang();
    });
  } else {
    injectToggle();
    applyLang();
  }

})();
