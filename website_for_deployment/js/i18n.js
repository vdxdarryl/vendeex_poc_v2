/**
 * VendeeX i18n — Chinese language toggle (demo only)
 * v1.0
 *
 * Self-initialising. Injects a flag toggle into .nav-container on every
 * page. Reads data-i18n / data-i18n-placeholder attributes and replaces
 * text content with the active language on load and on each toggle click.
 *
 * localStorage key : 'vx-lang'  ('en' | 'zh')
 * window.getLang() : returns current lang string
 * window.t(key)    : returns translated string (falls back to EN)
 */

(function () {
  'use strict';

  var STRINGS = {
    en: {
      'banner.poc':  'Agentic Commerce Proof of Concept',
      'banner.sub':  'Experience an AI buying agent that works exclusively for you',
      'info.happening': 'What is happening',
      'info.matters':   'Why it matters',
      'info.cando':     'What you can do',
      'info.canDo':     'What you can do',
      'nav.home':       'Home',
      'nav.tryDemo':    'Try Demo',
      'nav.howItWorks': 'How It Works',
      'nav.merchants':  'Merchants',
      'nav.login':      'Login',
      'nav.newSearch':  'New Search',
      'nav.getStarted': 'Get Started',
      'footer.contact': 'Contact Us',
      'footer.demo':    'DEMONSTRATION VERSION',
      'index.happening.p':  'You are about to experience an AI buying agent that works exclusively for you.',
      'index.matters.p':    'Unlike marketplaces, this agent has no seller incentives. It represents your interests only.',
      'index.cando.p':      'Create your Avatar for personalised results, or sign in to continue searching.',
      'index.pocTag':       'AGENTIC COMMERCE PROOF OF CONCEPT',
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
      'demo.happening.p':   'Your agent is listening. It will search across a billion products to find the best matches for your needs.',
      'demo.matters.p':     'A smarter conversation now means better results later. The agent reasons about your request before acting.',
      'demo.cando.p':       'Describe what you want to buy in natural language. Refine results through the chat after searching.',
      'demo.heroTitle':     'Experience VendeeX AI',
      'demo.heroSub':       "Describe what you're looking for, and watch our AI find the perfect matches",
      'demo.searchLabel':   'What are you looking for?',
      'demo.editAvatar':    '\u2699 Edit Avatar',
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
      'qualify.searchNow':  'Search Now',
      'qualify.inputPH':    'Type your answer\u2026',
      'demo.searchingTitle': 'AI Agents are Searching\u2026',
      'demo.searchingSub':  'Finding the perfect match for your request',
      'demo.resultsTitle':  'Your Curated Recommendations',
      'demo.resultsFound':  'Found',
      'demo.resultsSuffix': 'products matching your criteria',
      'demo.aiAnalysis':    'VendeeX AI Analysis',
      'demo.shipping':      'Shipping:',
      'demo.standard':      'Standard',
      'demo.express':       'Express',
      'demo.refineBtn':     'Refine My Search',
      'login.happening.p': 'Sign in to restore your Vendee Avatar and continue your personalised buying experience.',
      'login.matters.p':   'Your avatar remembers your preferences, location, and buy-local settings so your agent can work smarter.',
      'login.cando.p':     'Enter your email to restore your avatar, or start searching without signing in.',
      'login.title':       'Welcome Back',
      'login.sub':         'Sign in to continue your smart buying journey',
      'login.googleBtn':   'Continue with Google',
      'login.githubBtn':   'Continue with GitHub',
      'login.orEmail':     'or sign in with email',
      'login.emailPH':     'Email Address',
      'login.emailInputPH': 'Enter the email you registered with',
      'login.restoreBtn':  'Restore My Avatar',
      'login.noAccount':   "Don't have an account?",
      'login.signup':      'Sign up for free',
      'login.demoNote':    'This is a demonstration. No data is stored.',
      'reg.info.happening': 'You are creating your Vendee Avatar \u2014 a persistent digital identity that shapes how your autonomous agent shops for you.',
      'reg.info.matters':   'Your avatar tells your agent who you are, what you value, and how you like to shop. It enforces your preferences automatically.',
      'reg.info.canDo':     'Complete two short steps: identify yourself, then set your values and preferences. Takes under a minute.',
      'reg.title':          'Create Your Vendee Avatar',
      'reg.credential':     'VendeeX never stores your personal documents or payment methods. Your Avatar carries a W3C Verifiable Credential, signed with Ed25519, that proves who you are without needing to keep copies of any personally identifying documents or payment credentials.',
      'reg.step1.heading':  'Who is your Avatar representing?',
      'reg.step1.personal.label': 'Personal Shopper',
      'reg.step1.personal.desc':  'Your agent shops for you personally',
      'reg.step1.business.label': 'Business Entity',
      'reg.step1.business.desc':  'Your agent acts on behalf of your organisation',
      'reg.step1.gov.label': 'Government Agency',
      'reg.step1.gov.desc':  'Your agent operates within public procurement rules',
      'reg.step1.continue': 'Continue to Preferences',
      'reg.step2.desc':  'Your Avatar is your persistent digital identity. It tells your agent what values need to be applied to every purchase decision. You set these global preferences on setup only. Although you can tweak them at any time. Once set they are applied against all your product searches.',
      'reg.step2.title': 'Set your preferences',
      'reg.step2.back':  'Back',
      'reg.step2.create': 'Create My Avatar',
      'reg.success.title': 'Avatar Created',
      'reg.success.search': 'Start Searching',
      'reg.footer.copyright': '\u00a9 2026 Vendee Labs Limited. All rights reserved.',
      'reg.footer.privacy':   'Privacy Notice'
    },
    zh: {
      'banner.poc':  '\u667a\u80fd\u4ee3\u7406\u5546\u52a1\u6982\u5ff5\u9a8c\u8bc1',
      'banner.sub':  '\u4f53\u9a8c\u4e13\u4e3a\u60a8\u670d\u52a1\u7684AI\u8d2d\u7269\u4ee3\u7406',
      'info.happening': '\u6b63\u5728\u53d1\u751f\u4ec0\u4e48',
      'info.matters':   '\u4e3a\u4f55\u91cd\u8981',
      'info.cando':     '\u60a8\u53ef\u4ee5\u505a\u4ec0\u4e48',
      'info.canDo':     '\u60a8\u53ef\u4ee5\u505a\u4ec0\u4e48',
      'nav.home':       '\u9996\u9875',
      'nav.tryDemo':    '\u8bd5\u7528\u6f14\u793a',
      'nav.howItWorks': '\u4f7f\u7528\u65b9\u6cd5',
      'nav.merchants':  '\u5546\u5bb6',
      'nav.login':      '\u767b\u5f55',
      'nav.newSearch':  '\u65b0\u641c\u7d22',
      'nav.getStarted': '\u5f00\u59cb\u4f7f\u7528',
      'footer.contact': '\u8054\u7cfb\u6211\u4eec',
      'footer.demo':    '\u6f14\u793a\u7248\u672c',
      'index.happening.p':  '\u60a8\u5373\u5c06\u4f53\u9a8c\u4e00\u4e2a\u5b8c\u5168\u4ee3\u8868\u60a8\u5229\u76ca\u7684AI\u8d2d\u7269\u4ee3\u7406\u3002',
      'index.matters.p':    '\u4e0e\u5e02\u573a\u5e73\u53f0\u4e0d\u540c\uff0c\u8be5\u4ee3\u7406\u6ca1\u6709\u5356\u5bb6\u6fc0\u52b1\u673a\u5236\u3002\u5b83\u4ec5\u4ee3\u8868\u60a8\u7684\u5229\u76ca\u3002',
      'index.cando.p':      '\u521b\u5efa\u60a8\u7684\u5316\u8eab\u4ee5\u83b7\u53d6\u4e2a\u6027\u5316\u7ed3\u679c\uff0c\u6216\u767b\u5f55\u7ee7\u7eed\u641c\u7d22\u3002',
      'index.pocTag':       '\u667a\u80fd\u4ee3\u7406\u5546\u52a1\u6982\u5ff5\u9a8c\u8bc1',
      'index.powered':      '\u7531\u667a\u80fd AI + ACP \u534f\u8bae\u9a71\u52a8',
      'index.createTitle':  '\u521b\u5efa\u60a8\u7684\u5316\u8eab',
      'index.createDesc':   '\u4e2a\u6027\u5316\u7ed3\u679c\u3001\u8fd0\u8d39\u8ba1\u7b97\u548c\u672c\u5730\u8d2d\u4e70\u504f\u597d\u3002\u53ea\u9700 30 \u79d2\u3002',
      'index.createBtn':    '\u521b\u5efa\u5316\u8eab',
      'index.or':           '\u6216',
      'index.returningTitle': '\u5df2\u6709\u8d26\u53f7',
      'index.returningDesc':  '\u51c6\u5907\u641c\u7d22\u66f4\u591a\u4ea7\u54c1\uff1f\u9700\u8981\u4fee\u6539\u5316\u8eab\u504f\u597d\u8bbe\u7f6e\u5417\uff1f',
      'index.loginBtn':     '\u767b\u5f55\u5e76\u641c\u7d22',
      'index.stat1':        '\u53ef\u641c\u7d22\u4ea7\u54c1',
      'index.stat2':        '\u5df2\u8fde\u63a5\u4f9b\u5e94\u5546',
      'index.stat3':        '\u4e70\u5bb6\u4e3b\u6743',
      'index.footerTag':    'VendeeX \u662f\u667a\u80fd\u4ee3\u7406\u5546\u52a1\u7684\u57fa\u7840\u8bbe\u65bd\u5c42\u3002\u60a8\u7684 AI \u4ee3\u7406\u5b8c\u5168\u4e3a\u60a8\u5de5\u4f5c\u3002',
      'demo.happening.p':   '\u60a8\u7684\u4ee3\u7406\u6b63\u5728\u76d1\u542c\u3002\u5b83\u5c06\u5728\u5341\u4ebf\u79cd\u4ea7\u54c1\u4e2d\u641c\u7d22\uff0c\u627e\u5230\u6700\u7b26\u5408\u60a8\u9700\u6c42\u7684\u4ea7\u54c1\u3002',
      'demo.matters.p':     '\u73b0\u5728\u66f4\u667a\u80fd\u7684\u5bf9\u8bdd\u610f\u5473\u7740\u66f4\u597d\u7684\u7ed3\u679c\u3002\u4ee3\u7406\u5728\u884c\u52a8\u524d\u4f1a\u5bf9\u60a8\u7684\u8bf7\u6c42\u8fdb\u884c\u63a8\u7406\u3002',
      'demo.cando.p':       '\u7528\u81ea\u7136\u8bed\u8a00\u63cf\u8ff0\u60a8\u60f3\u8d2d\u4e70\u7684\u4ea7\u54c1\u3002\u641c\u7d22\u540e\u901a\u8fc7\u804a\u5929\u7ec6\u5316\u7ed3\u679c\u3002',
      'demo.heroTitle':     '\u4f53\u9a8c VendeeX AI',
      'demo.heroSub':       '\u63cf\u8ff0\u60a8\u5728\u5bfb\u627e\u4ec0\u4e48\uff0c\u89c2\u770b\u6211\u4eec\u7684 AI \u627e\u5230\u5b8c\u7f8e\u5339\u914d',
      'demo.searchLabel':   '\u60a8\u5728\u5bfb\u627e\u4ec0\u4e48\uff1f',
      'demo.editAvatar':    '\u2699 \u7f16\u8f91\u5316\u8eab',
      'demo.searchDesc':    '\u7528\u81ea\u7136\u8bed\u8a00\u63cf\u8ff0\u60a8\u7684\u7406\u60f3\u4ea7\u54c1\uff0c\u5305\u62ec\u9884\u7b97\u3001\u529f\u80fd\u548c\u504f\u597d\u3002',
      'demo.findBtn':       '\u67e5\u627e\u4ea7\u54c1',
      'demo.examples':      '\u8bd5\u8bd5\u8fd9\u4e9b\u793a\u4f8b',
      'demo.ex1':           '\u8fd0\u52a8\u8863\u6a59\u66f4\u65b0',
      'demo.ex2':           '\u65c5\u884c\u7b14\u8bb0\u672c\u7535\u8111',
      'demo.ex3':           '\u53ef\u6301\u7eed\u57fa\u7840\u5355\u54c1',
      'demo.ex4':           '\u65b0\u5367\u5ba4\u5e03\u7f6e',
      'demo.ex5':           '\u626b\u5730\u673a\u5668\u4eba',
      'demo.agentTitle':    '\u60a8\u7684\u4ee3\u7406\u6b63\u5728\u76d1\u542c',
      'demo.agentSub':      '\u56de\u7b54\u51e0\u4e2a\u7b80\u77ed\u95ee\u9898\uff0c\u8ba9\u60a8\u7684\u4ee3\u7406\u627e\u5230\u60a8\u771f\u6b63\u9700\u8981\u7684\u4ea7\u54c1\u3002',
      'demo.sendBtn':       '\u53d1\u9001',
      'demo.skipBtn':       '\u8df3\u8fc7 \u2014 \u7acb\u5373\u641c\u7d22',
      'qualify.searchNow':  '\u7acb\u5373\u641c\u7d22',
      'qualify.inputPH':    '\u8f93\u5165\u60a8\u7684\u56de\u7b54\u2026',
      'demo.searchingTitle': 'AI \u4ee3\u7406\u6b63\u5728\u641c\u7d22\u2026',
      'demo.searchingSub':  '\u4e3a\u60a8\u7684\u8bf7\u6c42\u5bfb\u627e\u5b8c\u7f8e\u5339\u914d',
      'demo.resultsTitle':  '\u60a8\u7684\u7cbe\u9009\u63a8\u8350',
      'demo.resultsFound':  '\u627e\u5230',
      'demo.resultsSuffix': '\u4ef6\u7b26\u5408\u60a8\u6807\u51c6\u7684\u4ea7\u54c1',
      'demo.aiAnalysis':    'VendeeX AI \u5206\u6790',
      'demo.shipping':      '\u8fd0\u8d39:',
      'demo.standard':      '\u6807\u51c6',
      'demo.express':       '\u5feb\u9012',
      'demo.refineBtn':     '\u7ec6\u5316\u6211\u7684\u641c\u7d22',
      'login.happening.p': '\u767b\u5f55\u4ee5\u6062\u590d\u60a8\u7684 Vendee \u5316\u8eab\uff0c\u7ee7\u7eed\u4e2a\u6027\u5316\u8d2d\u7269\u4f53\u9a8c\u3002',
      'login.matters.p':   '\u60a8\u7684\u5316\u8eab\u8bb0\u4f4f\u60a8\u7684\u504f\u597d\u3001\u4f4d\u7f6e\u548c\u672c\u5730\u8d2d\u4e70\u8bbe\u7f6e\uff0c\u8ba9\u60a8\u7684\u4ee3\u7406\u66f4\u667a\u80fd\u5730\u5de5\u4f5c\u3002',
      'login.cando.p':     '\u8f93\u5165\u60a8\u7684\u7535\u5b50\u90ae\u4ef6\u4ee5\u6062\u590d\u5316\u8eab\uff0c\u6216\u65e0\u9700\u767b\u5f55\u5373\u53ef\u5f00\u59cb\u641c\u7d22\u3002',
      'login.title':       '\u6b22\u8fce\u56de\u6765',
      'login.sub':         '\u767b\u5f55\u7ee7\u7eed\u60a8\u7684\u667a\u80fd\u8d2d\u7269\u65c5\u7a0b',
      'login.googleBtn':   '\u4f7f\u7528 Google \u7ee7\u7eed',
      'login.githubBtn':   '\u4f7f\u7528 GitHub \u7ee7\u7eed',
      'login.orEmail':     '\u6216\u4f7f\u7528\u7535\u5b50\u90ae\u4ef6\u767b\u5f55',
      'login.emailPH':     '\u7535\u5b50\u90ae\u4ef6\u5730\u5740',
      'login.emailInputPH': '\u8bf7\u8f93\u5165\u60a8\u6ce8\u518c\u65f6\u4f7f\u7528\u7684\u90ae\u7b71',
      'login.restoreBtn':  '\u6062\u590d\u6211\u7684\u5316\u8eab',
      'login.noAccount':   '\u6ca1\u6709\u8d26\u53f7\uff1f',
      'login.signup':      '\u514d\u8d39\u6ce8\u518c',
      'login.demoNote':    '\u8fd9\u662f\u6f14\u793a\u7248\u672c\u3002\u4e0d\u5b58\u50a8\u4efb\u4f55\u6570\u636e\u3002',
      'reg.info.happening': '\u60a8\u6b63\u5728\u521b\u5efa Vendee \u5316\u8eab \u2014 \u4e00\u4e2a\u6301\u4e45\u7684\u6570\u5b57\u8eab\u4efd\uff0c\u5851\u9020\u60a8\u7684\u81ea\u4e3b\u4ee3\u7406\u4e3a\u60a8\u8d2d\u7269\u7684\u65b9\u5f0f\u3002',
      'reg.info.matters':   '\u60a8\u7684\u5316\u8eab\u544a\u8bc9\u60a8\u7684\u4ee3\u7406\u60a8\u662f\u8c01\u3001\u60a8\u91cd\u89c6\u4ec0\u4e48\u4ee5\u53ca\u60a8\u559c\u6b22\u600e\u6837\u8d2d\u7269\u3002\u5b83\u81ea\u52a8\u6267\u884c\u60a8\u7684\u504f\u597d\u3002',
      'reg.info.canDo':     '\u5b8c\u6210\u4e24\u4e2a\u7b80\u77ed\u6b65\u9aa4\uff1a\u786e\u8ba4\u60a8\u7684\u8eab\u4efd\uff0c\u7136\u540e\u8bbe\u7f6e\u60a8\u7684\u4ef7\u5024\u89c2\u548c\u504f\u597d\u3002\u4e0d\u5230\u4e00\u5206\u949f\u3002',
      'reg.title':          '\u521b\u5efa\u60a8\u7684 Vendee \u5316\u8eab',
      'reg.credential':     'VendeeX \u4ece\u4e0d\u5b58\u50a8\u60a8\u7684\u4e2a\u4eba\u6587\u4ef6\u6216\u652f\u4ed8\u65b9\u5f0f\u3002\u60a8\u7684\u5316\u8eab\u643a\u5e26 W3C \u53ef\u9a8c\u8bc1\u51ed\u8bc1\uff0c\u4f7f\u7528 Ed25519 \u7b7e\u540d\uff0c\u65e0\u9700\u4fdd\u7559\u4efb\u4f55\u4e2a\u4eba\u8eab\u4efd\u6587\u4ef6\u6216\u652f\u4ed8\u51ed\u8bc1\u526f\u672c\u5373\u53ef\u8bc1\u660e\u60a8\u7684\u8eab\u4efd\u3002',
      'reg.step1.heading':  '\u60a8\u7684\u5316\u8eab\u4ee3\u8868\u8c01\uff1f',
      'reg.step1.personal.label': '\u4e2a\u4eba\u8d2d\u7269\u8005',
      'reg.step1.personal.desc':  '\u60a8\u7684\u4ee3\u7406\u4e3a\u60a8\u4e2a\u4eba\u8d2d\u7269',
      'reg.step1.business.label': '\u5546\u4e1a\u5b9e\u4f53',
      'reg.step1.business.desc':  '\u60a8\u7684\u4ee3\u7406\u4ee3\u8868\u60a8\u7684\u7ec4\u7ec7\u884c\u4e8b',
      'reg.step1.gov.label': '\u653f\u5e9c\u673a\u6784',
      'reg.step1.gov.desc':  '\u60a8\u7684\u4ee3\u7406\u5728\u516c\u5171\u91c7\u8d2d\u89c4\u5219\u4e0b\u8fd0\u884c',
      'reg.step1.continue': '\u7ee7\u7eed\u8bbe\u7f6e\u504f\u597d',
      'reg.step2.desc':  '\u60a8\u7684\u5316\u8eab\u662f\u60a8\u6301\u4e45\u7684\u6570\u5b57\u8eab\u4efd\u3002\u5b83\u544a\u8bc9\u60a8\u7684\u4ee3\u7406\u6bcf\u6b21\u8d2d\u4e70\u51b3\u7b56\u9700\u8981\u5e94\u7528\u4ec0\u4e48\u4ef7\u5024\u89c2\u3002\u60a8\u5728\u8bbe\u7f6e\u65f6\u786e\u5b9a\u8fd9\u4e9b\u5168\u5c40\u504f\u597d\uff0c\u4f46\u968f\u65f6\u53ef\u4ee5\u8c03\u6574\u3002\u4e00\u65e6\u8bbe\u5b9a\uff0c\u5b83\u4eec\u5c06\u5e94\u7528\u4e8e\u60a8\u7684\u6240\u6709\u4ea7\u54c1\u641c\u7d22\u3002',
      'reg.step2.title': '\u8bbe\u7f6e\u60a8\u7684\u504f\u597d',
      'reg.step2.back':  '\u8fd4\u56de',
      'reg.step2.create': '\u521b\u5efa\u6211\u7684\u5316\u8eab',
      'reg.success.title': '\u5316\u8eab\u5df2\u521b\u5efa',
      'reg.success.search': '\u5f00\u59cb\u641c\u7d22',
      'reg.footer.copyright': '\u00a9 2026 Vendee Labs Limited. \u7248\u6743\u6240\u6709\u3002',
      'reg.footer.privacy':   '\u9690\u79c1\u58f0\u660e'
    }
  };

  window.getLang = function () {
    return localStorage.getItem('vx-lang') || 'en';
  };

  window.t = function (key) {
    var lang = window.getLang();
    var val = (STRINGS[lang] || {})[key];
    if (val === undefined) val = (STRINGS['en'] || {})[key];
    return val !== undefined ? val : key;
  };

  function applyTranslations() {
    document.querySelectorAll('[data-i18n]').forEach(function (el) {
      var val = window.t(el.getAttribute('data-i18n'));
      if (val !== el.getAttribute('data-i18n')) el.textContent = val;
    });
    document.querySelectorAll('[data-i18n-placeholder]').forEach(function (el) {
      var val = window.t(el.getAttribute('data-i18n-placeholder'));
      if (val !== el.getAttribute('data-i18n-placeholder')) el.setAttribute('placeholder', val);
    });
    document.querySelectorAll('[data-i18n-html]').forEach(function (el) {
      var val = window.t(el.getAttribute('data-i18n-html'));
      if (val !== el.getAttribute('data-i18n-html')) el.innerHTML = val;
    });
    updateToggleState();
  }

  var TOGGLE_CSS = '.vx-lang-toggle{display:flex;align-items:center;border:1px solid rgba(255,255,255,0.25);border-radius:20px;overflow:hidden;margin-left:12px;flex-shrink:0;}.vx-lang-opt{padding:4px 10px;font-size:0.75rem;font-weight:600;cursor:pointer;user-select:none;transition:background 0.18s,color 0.18s;color:rgba(255,255,255,0.65);background:transparent;white-space:nowrap;border:none;font-family:inherit;}.vx-lang-opt:hover{color:#fff;}.vx-lang-opt.vx-lang-active{background:rgba(255,255,255,0.18);color:#fff;}@media(max-width:600px){.vx-lang-toggle{margin-left:8px;}.vx-lang-opt{padding:3px 8px;font-size:0.7rem;}}';

  function injectToggle() {
    if (document.getElementById('vxLangToggle')) return;
    var style = document.createElement('style');
    style.textContent = TOGGLE_CSS;
    document.head.appendChild(style);
    var toggle = document.createElement('div');
    toggle.id = 'vxLangToggle';
    toggle.className = 'vx-lang-toggle';
    toggle.setAttribute('role', 'group');
    toggle.setAttribute('aria-label', 'Language selector');
    toggle.innerHTML =
      '<button class="vx-lang-opt" data-lang="en">\uD83C\uDDEC\uD83C\uDDE7\u00a0EN</button>' +
      '<button class="vx-lang-opt" data-lang="zh">\uD83C\uDDE8\uD83C\uDDF3\u00a0\u4e2d\u6587</button>';
    var container = document.querySelector('.nav-container');
    if (container) {
      var mobileBtn = container.querySelector('.mobile-menu-btn');
      container.insertBefore(toggle, mobileBtn || null);
    }
    updateToggleState();
    toggle.addEventListener('click', function (e) {
      var btn = e.target.closest('.vx-lang-opt');
      if (!btn) return;
      var lang = btn.getAttribute('data-lang');
      if (lang === window.getLang()) return;
      localStorage.setItem('vx-lang', lang);
      applyTranslations();
    });
  }

  function updateToggleState() {
    var lang = window.getLang();
    document.querySelectorAll('.vx-lang-opt').forEach(function (btn) {
      btn.classList.toggle('vx-lang-active', btn.getAttribute('data-lang') === lang);
    });
  }

  function init() { injectToggle(); applyTranslations(); }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
