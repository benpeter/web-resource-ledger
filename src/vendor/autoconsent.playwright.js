"use strict";
(() => {
  var __typeError = (msg) => {
    throw TypeError(msg);
  };
  var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
  var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
  var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
  var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);

  // lib/consentomatic/tools.ts
  var _Tools = class _Tools {
    static setBase(base) {
      _Tools.base = base;
    }
    static findElement(options, parent = null, multiple = false) {
      let possibleTargets = null;
      if (parent != null) {
        possibleTargets = Array.from(parent.querySelectorAll(options.selector));
      } else {
        if (_Tools.base != null) {
          possibleTargets = Array.from(
            _Tools.base.querySelectorAll(options.selector)
          );
        } else {
          possibleTargets = Array.from(
            document.querySelectorAll(options.selector)
          );
        }
      }
      if (options.textFilter != null) {
        possibleTargets = possibleTargets.filter((possibleTarget) => {
          const textContent = possibleTarget.textContent.toLowerCase();
          if (Array.isArray(options.textFilter)) {
            let foundText = false;
            for (const text of options.textFilter) {
              if (textContent.indexOf(text.toLowerCase()) !== -1) {
                foundText = true;
                break;
              }
            }
            return foundText;
          } else if (options.textFilter != null) {
            return textContent.indexOf(options.textFilter.toLowerCase()) !== -1;
          }
          return false;
        });
      }
      if (options.styleFilters != null) {
        possibleTargets = possibleTargets.filter((possibleTarget) => {
          const styles = window.getComputedStyle(possibleTarget);
          let keep = true;
          for (const styleFilter of options.styleFilters) {
            const option = styles[styleFilter.option];
            if (styleFilter.negated) {
              keep = keep && option !== styleFilter.value;
            } else {
              keep = keep && option === styleFilter.value;
            }
          }
          return keep;
        });
      }
      if (options.displayFilter != null) {
        possibleTargets = possibleTargets.filter((possibleTarget) => {
          if (options.displayFilter) {
            return possibleTarget.offsetHeight !== 0;
          } else {
            return possibleTarget.offsetHeight === 0;
          }
        });
      }
      if (options.iframeFilter != null) {
        possibleTargets = possibleTargets.filter(() => {
          if (options.iframeFilter) {
            return window.location !== window.parent.location;
          } else {
            return window.location === window.parent.location;
          }
        });
      }
      if (options.childFilter != null) {
        possibleTargets = possibleTargets.filter((possibleTarget) => {
          const oldBase = _Tools.base;
          _Tools.setBase(possibleTarget);
          const childResults = _Tools.find(options.childFilter);
          _Tools.setBase(oldBase);
          return childResults.target != null;
        });
      }
      if (multiple) {
        return possibleTargets;
      } else {
        if (possibleTargets.length > 1) {
          console.warn(
            "Multiple possible targets: ",
            possibleTargets,
            options,
            parent
          );
        }
        return possibleTargets[0];
      }
    }
    static find(options, multiple = false) {
      const results = [];
      if (options.parent != null) {
        const parent = _Tools.findElement(options.parent, null, multiple);
        if (parent != null) {
          if (parent instanceof Array) {
            parent.forEach((p) => {
              const targets = _Tools.findElement(options.target, p, multiple);
              if (targets instanceof Array) {
                targets.forEach((target) => {
                  results.push({
                    parent: p,
                    target
                  });
                });
              } else {
                results.push({
                  parent: p,
                  target: targets
                });
              }
            });
            return results;
          } else {
            const targets = _Tools.findElement(options.target, parent, multiple);
            if (targets instanceof Array) {
              targets.forEach((target) => {
                results.push({
                  parent,
                  target
                });
              });
            } else {
              results.push({
                parent,
                target: targets
              });
            }
          }
        }
      } else {
        const targets = _Tools.findElement(options.target, null, multiple);
        if (targets instanceof Array) {
          targets.forEach((target) => {
            results.push({
              parent: null,
              target
            });
          });
        } else {
          results.push({
            parent: null,
            target: targets
          });
        }
      }
      if (results.length === 0) {
        results.push({
          parent: null,
          target: null
        });
      }
      if (multiple) {
        return results;
      } else {
        if (results.length !== 1) {
          console.warn(
            "Multiple results found, even though multiple false",
            results
          );
        }
        return results[0];
      }
    }
  };
  _Tools.base = null;
  var Tools = _Tools;

  // lib/consentomatic/index.ts
  function matches(config) {
    const result = Tools.find(config);
    if (config.type === "css") {
      return !!result.target;
    } else if (config.type === "checkbox") {
      return !!result.target && result.target.checked;
    }
  }
  async function executeAction(config, param) {
    switch (config.type) {
      case "click":
        return clickAction(config);
      case "list":
        return listAction(config, param);
      case "consent":
        return consentAction(config, param);
      case "ifcss":
        return ifCssAction(config, param);
      case "waitcss":
        return waitCssAction(config);
      case "foreach":
        return forEachAction(config, param);
      case "hide":
        return hideAction(config);
      case "slide":
        return slideAction(config);
      case "close":
        return closeAction();
      case "wait":
        return waitAction(config);
      case "eval":
        return evalAction(config);
      default:
        throw new Error("Unknown action type: " + config.type);
    }
  }
  var STEP_TIMEOUT = 0;
  function waitTimeout(timeout) {
    return new Promise((resolve) => {
      setTimeout(() => {
        resolve();
      }, timeout);
    });
  }
  async function clickAction(config) {
    const result = Tools.find(config);
    if (result.target != null) {
      result.target.click();
    }
    return waitTimeout(STEP_TIMEOUT);
  }
  async function listAction(config, param) {
    for (const action of config.actions) {
      await executeAction(action, param);
    }
  }
  async function consentAction(config, consentTypes) {
    for (const consentConfig of config.consents) {
      const shouldEnable = consentTypes.indexOf(consentConfig.type) !== -1;
      if (consentConfig.matcher && consentConfig.toggleAction) {
        const isEnabled = matches(consentConfig.matcher);
        if (isEnabled !== shouldEnable) {
          await executeAction(consentConfig.toggleAction);
        }
      } else {
        if (shouldEnable) {
          await executeAction(consentConfig.trueAction);
        } else {
          await executeAction(consentConfig.falseAction);
        }
      }
    }
  }
  async function ifCssAction(config, param) {
    const result = Tools.find(config);
    if (!result.target) {
      if (config.trueAction) {
        await executeAction(config.trueAction, param);
      }
    } else {
      if (config.falseAction) {
        await executeAction(config.falseAction, param);
      }
    }
  }
  async function waitCssAction(config) {
    await new Promise((resolve) => {
      let numRetries = config.retries || 10;
      const waitTime = config.waitTime || 250;
      const checkCss = () => {
        const result = Tools.find(config);
        if (config.negated && result.target || !config.negated && !result.target) {
          if (numRetries > 0) {
            numRetries -= 1;
            setTimeout(checkCss, waitTime);
          } else {
            resolve();
          }
        } else {
          resolve();
        }
      };
      checkCss();
    });
  }
  async function forEachAction(config, param) {
    const results = Tools.find(config, true);
    const oldBase = Tools.base;
    for (const result of results) {
      if (result.target) {
        Tools.setBase(result.target);
        await executeAction(config.action, param);
      }
    }
    Tools.setBase(oldBase);
  }
  async function hideAction(config) {
    const result = Tools.find(config);
    if (result.target) {
      result.target.classList.add("Autoconsent-Hidden");
    }
  }
  async function slideAction(config) {
    const result = Tools.find(config);
    const dragResult = Tools.find(config.dragTarget);
    if (result.target) {
      const targetBounds = result.target.getBoundingClientRect();
      const dragTargetBounds = dragResult.target.getBoundingClientRect();
      let yDiff = dragTargetBounds.top - targetBounds.top;
      let xDiff = dragTargetBounds.left - targetBounds.left;
      if (this.config.axis.toLowerCase() === "y") {
        xDiff = 0;
      }
      if (this.config.axis.toLowerCase() === "x") {
        yDiff = 0;
      }
      const screenX = window.screenX + targetBounds.left + targetBounds.width / 2;
      const screenY = window.screenY + targetBounds.top + targetBounds.height / 2;
      const clientX = targetBounds.left + targetBounds.width / 2;
      const clientY = targetBounds.top + targetBounds.height / 2;
      const mouseDown = document.createEvent("MouseEvents");
      mouseDown.initMouseEvent(
        "mousedown",
        true,
        true,
        window,
        0,
        screenX,
        screenY,
        clientX,
        clientY,
        false,
        false,
        false,
        false,
        0,
        result.target
      );
      const mouseMove = document.createEvent("MouseEvents");
      mouseMove.initMouseEvent(
        "mousemove",
        true,
        true,
        window,
        0,
        screenX + xDiff,
        screenY + yDiff,
        clientX + xDiff,
        clientY + yDiff,
        false,
        false,
        false,
        false,
        0,
        result.target
      );
      const mouseUp = document.createEvent("MouseEvents");
      mouseUp.initMouseEvent(
        "mouseup",
        true,
        true,
        window,
        0,
        screenX + xDiff,
        screenY + yDiff,
        clientX + xDiff,
        clientY + yDiff,
        false,
        false,
        false,
        false,
        0,
        result.target
      );
      result.target.dispatchEvent(mouseDown);
      await this.waitTimeout(10);
      result.target.dispatchEvent(mouseMove);
      await this.waitTimeout(10);
      result.target.dispatchEvent(mouseUp);
    }
  }
  async function waitAction(config) {
    await waitTimeout(config.waitTime);
  }
  async function closeAction() {
    window.close();
  }
  async function evalAction(config) {
    console.log("eval!", config.code);
    return new Promise((resolve) => {
      try {
        if (config.async) {
          window.eval(config.code);
          setTimeout(() => {
            resolve(window.eval("window.__consentCheckResult"));
          }, config.timeout || 250);
        } else {
          resolve(window.eval(config.code));
        }
      } catch (e) {
        console.warn("eval error", e, config.code);
        resolve(false);
      }
    });
  }

  // lib/random.ts
  function getRandomID() {
    if (crypto && typeof crypto.randomUUID !== "undefined") {
      return crypto.randomUUID();
    }
    return Math.random().toString();
  }

  // lib/eval-handler.ts
  var Deferred = class {
    constructor(id, timeout = 1e3) {
      this.id = id;
      this.promise = new Promise((resolve, reject) => {
        this.resolve = resolve;
        this.reject = reject;
      });
      this.timer = window.setTimeout(() => {
        this.reject(new Error("timeout"));
      }, timeout);
    }
  };
  var evalState = {
    pending: /* @__PURE__ */ new Map(),
    sendContentMessage: null
  };
  function requestEval(code, snippetId) {
    const id = getRandomID();
    evalState.sendContentMessage({
      type: "eval",
      id,
      code,
      snippetId
    });
    const deferred = new Deferred(id);
    evalState.pending.set(deferred.id, deferred);
    return deferred.promise;
  }
  function resolveEval(id, value) {
    const deferred = evalState.pending.get(id);
    if (deferred) {
      evalState.pending.delete(id);
      deferred.timer && window.clearTimeout(deferred.timer);
      deferred.resolve(value);
    } else {
      console.warn("no eval #", id);
    }
  }

  // lib/eval-snippets.ts
  var snippets = {
    // code-based rules
    EVAL_0: () => console.log(1),
    EVAL_CONSENTMANAGER_1: () => window.__cmp && typeof __cmp("getCMPData") === "object",
    EVAL_CONSENTMANAGER_2: () => !__cmp("consentStatus").userChoiceExists,
    EVAL_CONSENTMANAGER_3: () => __cmp("setConsent", 0),
    EVAL_CONSENTMANAGER_4: () => __cmp("setConsent", 1),
    EVAL_CONSENTMANAGER_5: () => __cmp("consentStatus").userChoiceExists,
    EVAL_COOKIEBOT_1: () => !!window.Cookiebot,
    EVAL_COOKIEBOT_2: () => !window.Cookiebot.hasResponse && window.Cookiebot.dialog?.visible === true,
    EVAL_COOKIEBOT_3: () => window.Cookiebot.withdraw() || true,
    EVAL_COOKIEBOT_4: () => window.Cookiebot.hide() || true,
    EVAL_COOKIEBOT_5: () => window.Cookiebot.declined === true,
    EVAL_KLARO_1: () => {
      const config = globalThis.klaroConfig || globalThis.klaro?.getManager && globalThis.klaro.getManager().config;
      if (!config) {
        return true;
      }
      const optionalServices = (config.services || config.apps).filter((s) => !s.required).map((s) => s.name);
      if (klaro && klaro.getManager) {
        const manager = klaro.getManager();
        return optionalServices.every((name) => !manager.consents[name]);
      } else if (klaroConfig && klaroConfig.storageMethod === "cookie") {
        const cookieName = klaroConfig.cookieName || klaroConfig.storageName;
        const consents = JSON.parse(
          decodeURIComponent(
            document.cookie.split(";").find((c) => c.trim().startsWith(cookieName)).split("=")[1]
          )
        );
        return Object.keys(consents).filter((k) => optionalServices.includes(k)).every((k) => consents[k] === false);
      }
    },
    EVAL_KLARO_OPEN_POPUP: () => {
      klaro.show(void 0, true);
    },
    EVAL_KLARO_TRY_API_OPT_OUT: () => {
      if (window.klaro && typeof klaro.show === "function" && typeof klaro.getManager === "function") {
        try {
          klaro.getManager().changeAll(false);
          klaro.getManager().saveAndApplyConsents();
          return true;
        } catch (e) {
          console.warn(e);
          return false;
        }
      }
      return false;
    },
    EVAL_ONETRUST_1: () => window.OnetrustActiveGroups.split(",").filter((s) => s.length > 0).length <= 1,
    EVAL_TRUSTARC_TOP: () => window && window.truste && window.truste.eu.bindMap.prefCookie === "0",
    EVAL_TRUSTARC_FRAME_TEST: () => window && window.QueryString && window.QueryString.preferences === "0",
    EVAL_TRUSTARC_FRAME_GTM: () => window && window.QueryString && window.QueryString.gtm === "1",
    // declarative rules
    EVAL_ADOPT_TEST: () => !!localStorage.getItem("adoptConsentMode"),
    EVAL_ADULTFRIENDFINDER_TEST: () => !!localStorage.getItem("cookieConsent"),
    EVAL_BAHN_TEST: () => utag.gdpr.getSelectedCategories().length === 1,
    EVAL_BIGCOMMERCE_CONSENT_MANAGER_DETECT: () => !!(window.consentManager && window.consentManager.version),
    EVAL_BORLABS_0: () => !JSON.parse(
      decodeURIComponent(
        document.cookie.split(";").find((c) => c.indexOf("borlabs-cookie") !== -1).split("=", 2)[1]
      )
    ).consents.statistics,
    EVAL_CC_BANNER2_0: () => !!document.cookie.match(/sncc=[^;]+D%3Dtrue/),
    EVAL_COINBASE_0: () => JSON.parse(decodeURIComponent(document.cookie.match(/cm_(eu|default)_preferences=([0-9a-zA-Z\\{\\}\\[\\]%:]*);?/)[2])).consent.length <= 1,
    EVAL_COOKIE_LAW_INFO_0: () => {
      if (CLI.disableAllCookies) CLI.disableAllCookies();
      if (CLI.reject_close) CLI.reject_close();
      document.body.classList.remove("cli-barmodal-open");
      return true;
    },
    EVAL_COOKIE_LAW_INFO_DETECT: () => !!window.CLI,
    EVAL_COOKIE_MANAGER_POPUP_0: () => JSON.parse(
      document.cookie.split(";").find((c) => c.trim().startsWith("CookieLevel")).split("=")[1]
    ).social === false,
    EVAL_COOKIEALERT_0: () => document.querySelector("body").removeAttribute("style") || true,
    EVAL_COOKIEALERT_1: () => document.querySelector("body").removeAttribute("style") || true,
    EVAL_COOKIEALERT_2: () => window.CookieConsent.declined === true,
    EVAL_COOKIEFIRST_0: () => ((o) => o.performance === false && o.functional === false && o.advertising === false)(
      JSON.parse(
        decodeURIComponent(
          document.cookie.split(";").find((c) => c.indexOf("cookiefirst") !== -1).trim()
        ).split("=")[1]
      )
    ),
    EVAL_COOKIEFIRST_1: () => document.querySelectorAll("button[data-cookiefirst-accent-color=true][role=checkbox]:not([disabled])").forEach((i) => i.getAttribute("aria-checked") === "true" && i.click()) || true,
    EVAL_COOKIEINFORMATION_0: () => CookieInformation.declineAllCategories() || true,
    EVAL_COOKIEINFORMATION_1: () => CookieInformation.submitAllCategories() || true,
    EVAL_ETSY_0: () => document.querySelectorAll(".gdpr-overlay-body input").forEach((toggle) => {
      toggle.checked = false;
    }) || true,
    EVAL_ETSY_1: () => document.querySelector(".gdpr-overlay-view button[data-wt-overlay-close]").click() || true,
    EVAL_EZOIC_0: () => ezCMP.handleAcceptAllClick(),
    EVAL_FIDES_DETECT_POPUP: () => window.Fides?.initialized,
    EVAL_GDPR_LEGAL_COOKIE_DETECT_CMP: () => !!window.GDPR_LC,
    EVAL_GDPR_LEGAL_COOKIE_TEST: () => !!window.GDPR_LC?.userConsentSetting,
    EVAL_IUBENDA_0: () => document.querySelectorAll(".purposes-item input[type=checkbox]:not([disabled])").forEach((x) => {
      if (x.checked) x.click();
    }) || true,
    EVAL_IUBENDA_1: () => !!document.cookie.match(/_iub_cs-\d+=/),
    EVAL_MEDIAVINE_0: () => document.querySelectorAll('[data-name="mediavine-gdpr-cmp"] input[type=checkbox]').forEach((x) => x.checked && x.click()) || true,
    EVAL_MICROSOFT_0: () => Array.from(document.querySelectorAll("div > button")).filter((el) => el.innerText.match("Reject|Ablehnen"))[0].click() || true,
    EVAL_MICROSOFT_1: () => Array.from(document.querySelectorAll("div > button")).filter((el) => el.innerText.match("Accept|Annehmen"))[0].click() || true,
    EVAL_MICROSOFT_2: () => !!document.cookie.match("MSCC|GHCC"),
    EVAL_MOOVE_0: () => document.querySelectorAll("#moove_gdpr_cookie_modal input").forEach((i) => {
      if (!i.disabled) i.checked = i.name === "moove_gdpr_strict_cookies" || i.id === "moove_gdpr_strict_cookies";
    }) || true,
    EVAL_NHNIEUWS_TEST: () => !!localStorage.getItem("psh:cookies-seen"),
    EVAL_OSANO_DETECT: () => !!window.Osano?.cm?.dialogOpen,
    EVAL_PANDECTES_TEST: () => document.cookie.includes("_pandectes_gdpr=") && JSON.parse(
      atob(
        document.cookie.split(";").find((s) => s.trim().startsWith("_pandectes_gdpr")).split("=")[1]
      )
    ).status === "deny",
    EVAL_POVR_GOBACK: () => window.history.back() || true,
    EVAL_PUBTECH_0: () => document.cookie.includes("euconsent-v2") && (document.cookie.match(/.YAAAAAAAAAAA/) || document.cookie.match(/.aAAAAAAAAAAA/) || document.cookie.match(/.YAAACFgAAAAA/)),
    EVAL_REMARKABLE_TEST: () => !!localStorage.getItem("rmCookieConsent"),
    EVAL_SHOPIFY_TEST: () => document.cookie.includes("gdpr_cookie_consent=0") || document.cookie.includes("_tracking_consent=") && JSON.parse(
      decodeURIComponent(
        document.cookie.split(";").find((s) => s.trim().startsWith("_tracking_consent")).split("=")[1]
      )
    ).purposes.a === false,
    EVAL_SKYSCANNER_TEST: () => document.cookie.match(/gdpr=[^;]*adverts:::false/) && !document.cookie.match(/gdpr=[^;]*init:::true/),
    EVAL_SIRDATA_UNBLOCK_SCROLL: () => {
      document.documentElement.classList.forEach((cls) => {
        if (cls.startsWith("sd-cmp-")) document.documentElement.classList.remove(cls);
      });
      return true;
    },
    EVAL_STEAMPOWERED_0: () => JSON.parse(
      decodeURIComponent(
        document.cookie.split(";").find((s) => s.trim().startsWith("cookieSettings")).split("=")[1]
      )
    ).preference_state === 2,
    EVAL_TAKEALOT_0: () => document.body.classList.remove("freeze") || (document.body.style = "") || true,
    EVAL_TARTEAUCITRON_0: () => tarteaucitron.userInterface.respondAll(false) || true,
    EVAL_TARTEAUCITRON_1: () => tarteaucitron.userInterface.respondAll(true) || true,
    EVAL_TARTEAUCITRON_2: () => document.cookie.match(/tarteaucitron=[^;]*/)?.[0].includes("false"),
    EVAL_TEALIUM_0: () => typeof window.utag !== "undefined" && typeof utag.gdpr === "object",
    EVAL_TEALIUM_1: () => utag.gdpr.setConsentValue(false) || true,
    EVAL_TEALIUM_DONOTSELL: () => utag.gdpr.dns?.setDnsState(false) || true,
    EVAL_TEALIUM_2: () => utag.gdpr.setConsentValue(true) || true,
    EVAL_TEALIUM_3: () => utag.gdpr.getConsentState() !== 1,
    EVAL_TEALIUM_DONOTSELL_CHECK: () => utag.gdpr.dns?.getDnsState() !== 1,
    EVAL_TESTCMP_STEP: () => !!document.querySelector("#reject-all"),
    EVAL_TESTCMP_0: () => window.results.results[0] === "button_clicked",
    EVAL_TESTCMP_COSMETIC_0: () => window.results.results[0] === "banner_hidden",
    EVAL_THEFREEDICTIONARY_0: () => cmpUi.showPurposes() || cmpUi.rejectAll() || true,
    EVAL_THEFREEDICTIONARY_1: () => cmpUi.allowAll() || true,
    EVAL_USERCENTRICS_API_0: () => typeof UC_UI === "object",
    EVAL_USERCENTRICS_API_1: () => !!UC_UI.closeCMP(),
    EVAL_USERCENTRICS_API_2: () => !!UC_UI.denyAllConsents(),
    EVAL_USERCENTRICS_API_3: () => !!UC_UI.acceptAllConsents(),
    EVAL_USERCENTRICS_API_4: () => !!UC_UI.closeCMP(),
    EVAL_USERCENTRICS_API_5: () => UC_UI.areAllConsentsAccepted() === true,
    EVAL_USERCENTRICS_API_6: () => UC_UI.areAllConsentsAccepted() === false,
    EVAL_USERCENTRICS_BUTTON_0: () => JSON.parse(localStorage.getItem("usercentrics")).consents.every((c) => c.isEssential || !c.consentStatus),
    EVAL_WAITROSE_0: () => Array.from(document.querySelectorAll("label[id$=cookies-deny-label]")).forEach((e) => e.click()) || true
  };
  function getFunctionBody(snippetFunc) {
    const snippetStr = snippetFunc.toString();
    return `(${snippetStr})()`;
  }

  // lib/utils.ts
  function getStyleElement(styleOverrideElementId = "autoconsent-css-rules") {
    const styleSelector = `style#${styleOverrideElementId}`;
    const existingElement = document.querySelector(styleSelector);
    if (existingElement && existingElement instanceof HTMLStyleElement) {
      return existingElement;
    } else {
      const parent = document.head || document.getElementsByTagName("head")[0] || document.documentElement;
      const css = document.createElement("style");
      css.id = styleOverrideElementId;
      parent.appendChild(css);
      return css;
    }
  }
  function getHidingStyle(method) {
    const hidingSnippet = method === "opacity" ? `opacity: 0` : `display: none`;
    return `${hidingSnippet} !important; z-index: -1 !important; pointer-events: none !important;`;
  }
  function hideElements(styleEl, selector, method = "display") {
    const rule = `${selector} { ${getHidingStyle(method)} } `;
    if (styleEl instanceof HTMLStyleElement) {
      styleEl.innerText += rule;
      return selector.length > 0;
    }
    return false;
  }
  async function waitFor(predicate, maxTimes, interval) {
    const result = await predicate();
    if (!result && maxTimes > 0) {
      return new Promise((resolve) => {
        setTimeout(async () => {
          resolve(waitFor(predicate, maxTimes - 1, interval));
        }, interval);
      });
    }
    return Promise.resolve(result);
  }
  function isElementVisible(elem) {
    if (!elem) {
      return false;
    }
    if (elem.offsetParent !== null) {
      return true;
    } else {
      const css = window.getComputedStyle(elem);
      if (css.position === "fixed" && css.display !== "none") {
        return true;
      }
    }
    return false;
  }
  function copyObject(data) {
    if (globalThis.structuredClone) {
      return structuredClone(data);
    }
    return JSON.parse(JSON.stringify(data));
  }
  function normalizeConfig(providedConfig) {
    const defaultConfig = {
      enabled: true,
      autoAction: "optOut",
      // if falsy, the extension will wait for an explicit user signal before opting in/out
      disabledCmps: [],
      enablePrehide: true,
      enableCosmeticRules: true,
      enableGeneratedRules: true,
      enableHeuristicDetection: false,
      enableHeuristicAction: false,
      detectRetries: 20,
      isMainWorld: false,
      prehideTimeout: 2e3,
      enableFilterList: false,
      visualTest: false,
      logs: {
        lifecycle: false,
        rulesteps: false,
        detectionsteps: false,
        evals: false,
        errors: true,
        messages: false,
        waits: false
      }
    };
    const updatedConfig = copyObject(defaultConfig);
    for (const key of Object.keys(defaultConfig)) {
      if (typeof providedConfig[key] !== "undefined") {
        updatedConfig[key] = providedConfig[key];
      }
    }
    return updatedConfig;
  }
  function scheduleWhenIdle(callback, timeout = 500) {
    if (globalThis.requestIdleCallback) {
      requestIdleCallback(callback, { timeout });
    } else {
      setTimeout(callback, 0);
    }
  }
  function highlightNode(node) {
    if (!node.style) return;
    if (node.__oldStyles !== void 0) {
      return;
    }
    if (node.hasAttribute("style")) {
      node.__oldStyles = node.style.cssText;
    }
    node.style.animation = "pulsate .5s infinite";
    node.style.outline = "solid red";
    let styleTag = document.querySelector("style#autoconsent-debug-styles");
    if (!styleTag) {
      styleTag = document.createElement("style");
      styleTag.id = "autoconsent-debug-styles";
    }
    styleTag.textContent = `
      @keyframes pulsate {
        0% {
          outline-width: 8px;
          outline-offset: -4px;
        }
        50% {
          outline-width: 4px;
          outline-offset: -2px;
        }
        100% {
          outline-width: 8px;
          outline-offset: -4px;
        }
      }
    `;
    document.head.appendChild(styleTag);
  }
  function unhighlightNode(node) {
    if (!node.style || !node.hasAttribute("style")) return;
    if (node.__oldStyles !== void 0) {
      node.style.cssText = node.__oldStyles;
      delete node.__oldStyles;
    } else {
      node.removeAttribute("style");
    }
  }
  function isTopFrame() {
    return window.top === window && (!globalThis.location.ancestorOrigins || globalThis.location.ancestorOrigins.length === 0);
  }

  // lib/heuristic-patterns.ts
  var DETECT_PATTERNS = [
    /accept cookies/gi,
    /accept all/gi,
    /reject all/gi,
    /only necessary cookies/gi,
    // "only necessary" is probably too broad
    /(?:by continuing.{0,100}cookie)|(?:cookie.{0,100}by continuing)/gi,
    /(?:by continuing.{0,100}privacy)|(?:privacy.{0,100}by continuing)/gi,
    /by clicking.{0,100}(?:accept|agree|allow)/gi,
    /we (?:use|serve)(?: optional)? cookies/gi,
    /we are using cookies/gi,
    /use of cookies/gi,
    /(?:this|our) (?:web)?site.{0,100}cookies/gi,
    /cookies (?:and|or) .{0,100} technologies/gi,
    /such as cookies/gi,
    /read more about.{0,100}cookies/gi,
    /consent to.{0,100}cookies/gi,
    /we and our partners.{0,100}cookies/gi,
    /we.{0,100}store.{0,100}information.{0,100}such as.{0,100}cookies/gi,
    /store and\/or access information.{0,100}on a device/gi,
    /personalised ads and content, ad and content measurement/gi,
    // it might be tempting to add the patterns below, but they cause too many false positives. Don't do it :)
    // /cookies? settings/i,
    // /cookies? preferences/i,
    // FR
    /utilisons.{0,100}des.{0,100}cookies/gi,
    /nous.{0,100}utilisons.{0,100}des/gi,
    /des.{0,100}cookies.{0,100}pour/gi,
    /des.{0,100}informations.{0,100}sur/gi,
    /retirer.{0,100}votre.{0,100}consentement/gi,
    /accéder.{0,100}à.{0,100}des/gi,
    /à.{0,100}des.{0,100}informations/gi,
    /et.{0,100}nos.{0,100}partenaires/gi,
    /publicités.{0,100}et.{0,100}du.{0,100}contenu/gi,
    /utilise.{0,100}des.{0,100}cookies/gi,
    /utilisent.{0,100}des.{0,100}cookies/gi,
    /stocker.{0,100}et.{0,100}ou.{0,100}accéder/gi,
    /consentement.{0,100}à.{0,100}tout.{0,100}moment/gi,
    /votre.{0,100}consentement/gi,
    /accepter.{0,100}tout/gi,
    /utilisation.{0,100}des.{0,100}cookies/gi,
    /cookies.{0,100}ou.{0,100}technologies/gi,
    /acceptez.{0,100}l.{0,100}utilisation/gi,
    /continuer sans accepter/gi,
    /tout refuser/gi,
    /(?:refuser|rejeter) tous les cookies/gi,
    /je refuse/gi,
    /refuser et continuer/gi,
    /refuser les cookies/gi,
    /seulement nécessaires/gi,
    /je désactive les finalités non essentielles/gi,
    /cookies essentiels uniquement/gi,
    /nécessaires uniquement/gi,
    // DE
    /wir.{0,100}verwenden.{0,100}cookies/gi,
    /wir.{0,100}und.{0,100}unsere.{0,100}partner/gi,
    /zugriff.{0,100}auf.{0,100}informationen.{0,100}auf/gi,
    /inhalte.{0,100}messung.{0,100}von.{0,100}werbeleistung.{0,100}und/gi,
    /cookies.{0,100}und.{0,100}andere/gi,
    /verwendung.{0,100}von.{0,100}cookies/gi,
    /wir.{0,100}nutzen.{0,100}cookies/gi,
    /verwendet.{0,100}cookies/gi,
    /sie.{0,100}können.{0,100}ihre.{0,100}auswahl/gi,
    /und.{0,100}ähnliche.{0,100}technologien/gi,
    /cookies.{0,100}wir.{0,100}verwenden/gi,
    /alles?.{0,100}ablehnen/gi,
    /(?:nur|nicht).{0,100}(?:zusätzliche|essenzielle|funktionale|notwendige|erforderliche).{0,100}(?:cookies|akzeptieren|erlauben|ablehnen)/gi,
    /weiter.{0,100}(?:ohne|mit).{0,100}(?:einwilligung|zustimmung|cookies)/gi,
    /(?:cookies|einwilligung).{0,100}ablehnen/gi,
    /nur funktionale cookies akzeptieren/gi,
    /optionale ablehnen/gi,
    /zustimmung verweigern/gi,
    // NL
    /gebruik.{0,100}van.{0,100}cookies/gi,
    /(?:we|wij).{0,100}gebruiken.{0,100}cookies.{0,100}om/gi,
    /cookies.{0,100}en.{0,100}vergelijkbare/gi,
    /(?:alles|cookies).{0,100}(?:afwijzen|weigeren|verwerpen)/gi,
    /alleen.{0,100}noodzakelijke?\b/gi,
    /cookies weigeren/gi,
    /weiger.{0,100}(?:cookies|alles)/gi,
    /doorgaan zonder (?:te accepteren|akkoord te gaan)/gi,
    /alleen.{0,100}(?:optionele|functionele|functioneel|noodzakelijke|essentiële).{0,100}cookies/gi,
    /wijs alles af/gi
  ];
  var REJECT_PATTERNS_ENGLISH = [
    // e.g. "i reject cookies", "reject all", "reject all cookies", "reject cookies", "deny all", "deny all cookies", "refuse", "refuse all", "refuse cookies", "refuse all cookies", "deny", "reject all and close", "deny all and close", "reject non-essential cookies", "reject all non-essential cookies and continue", "reject optional cookies", "reject additional cookies", "reject targeting cookies", "reject marketing cookies", "reject analytics cookies", "reject tracking cookies", "reject advertising cookies", "reject all and close", "deny all and close"
    // note that "reject and subscribe" and "reject and pay" are excluded
    /^\s*(i)?\s*(reject|deny|refuse|decline|disable)\s*(all)?\s*(non-essential|optional|additional|targeting|analytics|marketing|unrequired|non-necessary|extra|tracking|advertising)?\s*(cookies)?\s*$/is,
    // e.g. "i do not accept", "i do not accept cookies", "do not accept", "do not accept cookies"
    /^\s*(i)?\s*do\s+not\s+accept\s*(cookies)?\s*$/is,
    // e.g. "continue without accepting", "continue without agreeing", "continue without agreeing →"
    /^\s*(continue|proceed|continue\s+browsing)\s+without\s+(accepting|agreeing|consent|cookies|tracking)(\s*→)?\s*$/is,
    // e.g. "strictly necessary cookies only", "essential cookies only", "required only", "use necessary cookies only", "essentials only"
    // note that "only" is required
    /^\s*(use|accept|allow|continue\s+with)?\s*(strictly)?\s*(necessary|essentials?|required)?\s*(cookies)?\s*only\s*$/is,
    // e.g. "allow essential cookies", "allow necessary", "allow essentials", "allow essentials only"
    // note that "essential" is required
    /^\s*(use|accept|allow|continue\s+with)?\s*(strictly)?\s*(necessary|essentials?|required)\s*(cookies)?\s*$/is,
    // e.g. "accept only essential cookies", "use only necessary cookies", "allow only essential", "only essentials", "continue with only essential cookies"
    // note that "only" is required
    /^\s*(use|accept|allow|continue\s+with)?\s*only\s*(strictly)?\s*(necessary|essentials?|required)?\s*(cookies)?\s*$/is,
    // e.g. "do not sell or share my personal information", "do not sell my personal information"
    // often used in CCPA
    /^\s*do\s+not\s+sell(\s+or\s+share)?\s*my\s*personal\s*information\s*$/is
    // These are impactful, but look error-prone
    // // e.g. "disagree"
    // /^\s*(i)?\s*disagree\s*(and\s+close)?\s*$/i,
    // // e.g. "i do not agree"
    // /^\s*(i\s+)?do\s+not\s+agree\s*$/i,
  ];
  var REJECT_PATTERNS_DUTCH = [
    "weigeren",
    "alles afwijzen",
    "alleen noodzakelijke cookies",
    "afwijzen",
    "alles weigeren",
    "cookies weigeren",
    "alleen noodzakelijk",
    "weiger",
    "weiger cookies",
    "doorgaan zonder te accepteren",
    "alleen functionele cookies",
    "alleen functioneel",
    "alleen noodzakelijke",
    "alleen essenti\xEBle cookies",
    "functioneel",
    "alle cookies verwerpen",
    "doorgaan zonder akkoord te gaan",
    "weiger alles",
    "nee, bedankt",
    "alle cookies weigeren",
    "weiger alle cookies",
    "alleen noodzakelijke cookies accepteren",
    "alleen strikt noodzakelijk",
    "ik weiger",
    "optionele cookies weigeren",
    "alle weigeren",
    "accepteer alleen noodzakelijke cookies",
    "alleen functionele cookies accepteren",
    "enkel noodzakelijke cookies",
    "niet accepteren",
    "weiger niet-essenti\xEBle cookies",
    "weiger niet-noodzakelijke cookies",
    "wijs alles af",
    "alle cookies afwijzen",
    "alleen vereiste cookies",
    "cookies afwijzen",
    "doorgaan zonder accepteren",
    "hier weigeren",
    "weiger alle",
    "aanvaard enkel essenti\xEBle cookies",
    "aanvullende cookies weigeren",
    "accepteren weigeren",
    "alle afwijzen",
    "alle niet functionele afwijzen",
    "alle optionele weigeren",
    "alleen noodzakelijke accepteren",
    "alleen strikt noodzakelijke cookies",
    "allen afwijzen",
    "clear weigeren",
    "enkel functioneel",
    "enkel noodzakelijke cookies aanvaarden",
    "functioneel altijd actief",
    "nee, accepteer alleen de noodzakelijke",
    "nee, geen cookies a.u.b.",
    "nee, weiger cookies",
    "nee, weigeren",
    "niet-noodzakelijke cookies weigeren",
    "optioneel afwijzen",
    "tracking cookies weigeren",
    "weigeren cookies",
    "weigeren?",
    "weigeren.",
    "strikt noodzakelijk",
    "weiger optionele cookies",
    "noodzakelijke cookies",
    "essenti\xEBle cookies",
    "ga verder zonder aanvaarden",
    "doorgaan zonder cookies",
    "accepteer noodzakelijke cookies",
    "noodzakelijke",
    "indien je enkel technisch noodzakelijke cookies wenst te accepteren, klik dan hier",
    "weiger",
    "alleen de noodzakelijke cookies",
    "alleen noodzakelijk",
    "alleen verplichte cookies",
    "ik wil alleen minimale cookies",
    "doorgaan zonder te accepteren",
    "geen cookies toestaan",
    "liever geen cookies",
    "nee, geen persoonlijke cookies",
    "nee, liever geen cookies",
    "ga door zonder te accepteren",
    "verder zonder accepteren",
    "essenti\xEBle accepteren",
    "functionele cookies",
    "strikt noodzakelijke cookies",
    "alleen basic cookies",
    "alleen basiscookies",
    "alleen standaard cookies",
    "alle cookies verwerpen",
    "noodzakelijk",
    "noodzakelijk cookies accepteren",
    "noodzakelijke cookies accepteren",
    "accepteer alleen noodzakelijk",
    "enkel noodzakelijke toestaan",
    "enkel strikt noodzakelijke cookies",
    "ik wijs ze liever af",
    "ik weiger cookies",
    "ik weiger optionele cookies",
    "weiger alle cookies",
    "weiger alle niet-noodzakelijke cookies",
    "weiger alle onnodige cookies",
    "weiger alle optionele",
    "weiger alles",
    "weiger targeting en third party cookies."
  ];
  var REJECT_PATTERNS_FRENCH = [
    "continuer sans accepter",
    "tout refuser",
    "refuser",
    "refuser tous les cookies",
    "je refuse",
    "refuser tout",
    "tout rejeter",
    "refuser et continuer",
    "rejeter",
    "refuser les cookies",
    "cookies n\xE9cessaires uniquement",
    "seulement n\xE9cessaires",
    "rejeter tout",
    "refuser les cookies optionnels",
    "je d\xE9sactive les finalit\xE9s non essentielles",
    "refuser les cookies non n\xE9cessaires",
    "rejeter tous les cookies",
    "cookies essentiels uniquement",
    "n\xE9cessaires uniquement",
    "refuser les cookies non essentiels",
    "tout refuser et fermer",
    "tout refuser sauf les cookies techniques",
    "continuer sans accepter x",
    "je refuse lutilisation de cookies",
    "non merci, seulement des cookies techniques",
    "non, tout refuser",
    "refuser tous les cookies non n\xE9cessaires",
    "rejeter les cookies",
    "uniquement les essentiels",
    "refuser tous",
    "accepter uniquement les n\xE9cessaires",
    "allow anonymous analytics",
    "autoriser les cookies essentiels uniquement",
    "autoriser uniquement les n\xE9cessaires",
    "cookies essentiels seulement",
    "cookies n\xE9cessaires seulement",
    "cookies techniques uniquement",
    "je pr\xE9f\xE8re les rejeter",
    "je refuse :(",
    "je refuse les cookies",
    "je refuse tous les cookies",
    "je refuse tout",
    "ne pas accepter",
    "non, accepter les n\xE9cessaires uniquement",
    "refuser (sauf cookies n\xE9cessaires)",
    "refuser ce cookie",
    "refuser les coockies",
    "refuser les cookies facultatifs",
    "refuser tout, sauf les cookies techniques",
    "refuser toutes",
    "refuser toutes les options",
    "rejeter la banni\xE8re",
    "rejeter les cookies non essentiels",
    "rejeter les cookies optionnels",
    "rejeter tous les non fonctionnels",
    "rejeter tout optionnel",
    "tout refuser, sauf les cookies techniques",
    "uniquement n\xE9cessaires",
    "x continuer sans accepter",
    "strictement n\xE9cessaires",
    "utiliser uniquement les cookies n\xE9cessaires",
    "cookies n\xE9cessaires",
    "accepter uniquement les cookies essentiels",
    "accepter les cookies n\xE9cessaires",
    "uniquement les cookies n\xE9cessaires",
    "autoriser uniquement les cookies essentiels",
    "autoriser uniquement les cookies n\xE9cessaires",
    "si vous ne souhaitez pas accepter les cookies \xE0 lexception des cookies techniquement n\xE9cessaires, veuillez cliquer ici",
    "cookies strictement n\xE9cessaires",
    "accepter les cookies strictement n\xE9cessaires",
    "autoriser les cookies essentiels",
    "non, merci, uniquement les cookies n\xE9cessaires",
    "indispensable uniquement",
    "uniquement autoriser les cookies essentiels",
    "utiliser que les cookies n\xE9cessaires",
    "uniquement les sdk n\xE9cessaires",
    "uniquement n\xE9cessaire",
    "utiliser uniquement les cookies fonctionnels",
    "refus",
    "refusez",
    "naccepter que les cookies indispensables",
    "naccepter que les cookies n\xE9cessaires",
    "naccepter que les cookies techniques",
    "n\xE9cessaires seulement"
  ];
  var REJECT_PATTERNS_GERMAN = [
    "ablehnen",
    "alle ablehnen",
    "nur notwendige cookies",
    "nur essenzielle cookies akzeptieren",
    "nur notwendige cookies verwenden",
    "alles ablehnen",
    "nur notwendige",
    "alle cookies ablehnen",
    "weiter ohne einwilligung",
    "mit diesem button wird der dialog geschlossen. seine funktionalit\xE4t ist identisch mit der des buttons nur essenzielle cookies akzeptieren.",
    "cookies ablehnen",
    "optionale cookies ablehnen",
    "nur erforderliche cookies",
    "einwilligung ablehnen",
    "nur erforderliche",
    "nur notwendige cookies zulassen",
    "nur funktionale cookies akzeptieren",
    "nur notwendige cookies akzeptieren",
    "nur notwendige technologien",
    "verweigern",
    "webanalyse ablehnen",
    "weiter ohne zustimmung",
    "optionale ablehnen",
    "nur notwendige akzeptieren",
    "nur funktionale cookies",
    "mit diesem button wird der dialog geschlossen. seine funktionalit\xE4t ist identisch mit der des buttons ablehnen.",
    "nur notwendige cookies erlauben",
    "zustimmung verweigern",
    "nein, danke",
    "nur erforderliche cookies akzeptieren",
    "zus\xE4tzliche cookies ablehnen",
    "ablehnen und nur essenzielle cookies akzeptieren",
    "nicht erforderliche ablehnen",
    "nicht essenzielle cookies daten ablehnen",
    "nur technisch notwendige cookies",
    "nur technisch notwendige cookies akzeptieren",
    "ablehnen speichern",
    "alle funktionen ablehnen",
    "alle optionalen cookies ablehnen",
    "alles verweigern",
    "mit erforderlichen einstellungen fortfahren",
    "nicht notwendige ablehnen",
    "notwendige cookies akzeptieren",
    "nur erforderliche technologien",
    "nur essenzielle cookies",
    "nur essenzielle cookies erlauben",
    "technisch nicht notwendige cookies ablehnen",
    "tippen sie zum ablehnen bitte hier",
    "ablehnen deny",
    "fortfahren ohne zu akzeptieren",
    "nur erforderliche akzeptieren",
    "nur notwendige erlauben",
    "ablehnen ...nur technisch notwendige cookies verwendet werden",
    "ablehnen (au\xDFer notwendige cookies)",
    "ablehnen und fortfahren",
    "ablehnen und schlie\xDFen",
    "ablehnen: nur grundfunktionen",
    "akzeptieren nur notwendige cookies",
    "alle ablehnen (au\xDFer notwendige cookies)",
    "alle nicht essenziellen cookies ablehnen",
    "alle nicht notwendigen cookies ablehnen",
    "alle optionale ablehnen",
    "alle optionalen ablehnen",
    "alle verweigern",
    "analyse cookies ablehnen",
    "cookie einstellungenablehnen",
    "erforderliche cookies akzeptieren",
    "erforderliche cookies zulassen",
    "externe inhalte ablehnen",
    "mit diesem button wird der dialog geschlossen. seine funktionalit\xE4t ist identisch mit der des buttons ablehnen und nur essenzielle cookies akzeptieren.",
    "mit diesem button wird der dialog geschlossen. seine funktionalit\xE4t ist identisch mit der des buttons nicht-essenzielle cookies verweigern.",
    "mit diesem button wird der dialog geschlossen. seine funktionalit\xE4t ist identisch mit der des buttons nur essenzielle akzeptieren.",
    "mit erforderlichen cookies fortfahren",
    "mit notwendigen fortfahren",
    "nein, bitte nicht",
    "nein, ich stimme nicht zu",
    "nicht funktionale cookies ablehnen",
    "nicht notwendige cookies ablehnen",
    "nicht-essenzielle cookies ablehnen",
    "nicht-essenzielle cookies verweigern",
    "notwendige cookies zulassen",
    "nur erforderliche cookies erlauben",
    "nur erforderliche cookies setzen",
    "nur erforderliche cookies verwenden",
    "nur essenzielle akzeptieren",
    "nur notwendige cookies annehmen",
    "nur notwendige cookies speichern",
    "nur notwendige cookies verwenden.",
    "nur notwendige funktionscookies akzeptieren",
    "nur notwendigen cookies zustimmen",
    "nur notwendiges akzeptieren",
    "nur wesentliche cookies annehmen",
    "opt. cookies ablehnen",
    "optionale dienste ablehnen",
    "optionale tools ablehnen",
    "sie alle cookies ablehnen",
    "technisch notwendige annehmen",
    "nur essentielle cookies",
    "nur essentielle",
    "nur funktionale akzeptieren",
    "nur technisch notwendige akzeptieren",
    "nur technisch notwendige daten und cookies ...",
    "nur technisch notwendige zulassen",
    "nur wesentliche",
    "ohne einverst\xE4ndnis fortfahren",
    "ohne einwilligung",
    "ohne zustimmung fortfahren",
    "ohne zustimmung weiter",
    "weiter mit essentiellen cookies",
    "weiter ohne annahme",
    "weiter ohne statistische analyse-cookies",
    "weiter ohne statistische cookies",
    "wesentliche cookies",
    "fortfahren ohne zustimmung"
  ];
  var REJECT_PATTERNS_ITALIAN = [
    "rifiuta",
    "rifiuta cookies",
    "rifiuta i cookie",
    "rifiuta i cookies",
    "rifiuta tutti i cookie",
    "rifiuta tutti i cookies",
    "rifiuta cookie non necessari",
    "rifiuta i cookie non tecnici",
    "rifiuta non necessari",
    "rifiuta tutto",
    "rifiuta tutti",
    "rifiuta e chiudi",
    "chiudi rifiuta tutti i cookie",
    "chiudi e rifiuta tutti i cookie",
    "chiudi e rifiuta tutto",
    "nega",
    "nega tutti",
    "negare",
    "non accetto",
    "accetta solo i necessari",
    "usa solo i cookie necessari",
    "accetta solo necessari",
    "solo necessari",
    "continua senza accettare x",
    "continua senza accettare",
    "rifiutare",
    "rifiutare i cookie",
    "rifiutare tutti i cookie",
    "rifiutare tutti",
    "rifiutare e continuare",
    "installa solo i cookie strettamente necessari",
    "solo cookies tecnici",
    "accetta necessari",
    "solo cookie tecnici",
    "solo cookie necessari",
    "strettamente necessari",
    "tecnici",
    "accetta solo cookie di navigazione",
    "chiudi e prosegui solo con i cookies tecnici necessari",
    "consenti solo i cookie tecnici",
    "solo cookie essenziali",
    "blocca i cookie non essenziali",
    "accetta i cookie necessari",
    "accetta solo cookie tecnici",
    "accetta solo i cookie essenziali",
    "accetta solo i cookie necessari",
    "accetta solo i necessary",
    "accetta i cookie essenziali",
    "accetta cookie tecnici",
    "necessari",
    "usa solo i cookie tecnici",
    "usa solo i necessari",
    "rifiuto",
    "essenziali",
    "accetta cookie essenziali",
    "accetta cookie necessari",
    "accetta solo cookie essenziali",
    "accetta solo cookie necessari",
    "rifiuta cookie non necessari",
    "rifiuta cookie non essenziali",
    "rifiuta i cookie non necessari",
    "rifiuta i cookie non essenziali",
    "rifiuta tutti i cookie e chiudi",
    "rifiuta tutto e chiudi",
    "rifiuta tutti i cookie chiudi",
    "continuare senza accettare",
    "rifiutare cookies",
    "rifiutare i cookies",
    "rifiutare non necessari",
    "rifiutare tutto",
    "rifiutare e chiudere",
    "solo essenziali",
    "solo tecnici",
    "negare tutti"
  ];
  var REJECT_PATTERNS_BRAZILIAN_PORTUGUESE = [
    // (deny)
    /^\s*(rejeitar|recusar|desativar|bloquear|negar|não\s*aceito|não \s*aceitar)\s*$/is,
    // (proceed) (without accepting)
    /^\s*(continuar|prosseguir|seguir)\s*(sem\s*aceitar)\s*$/is,
    // (deny) (everything) (optional)
    /^\s*(rejeitar|recusar|desativar|bloquear|negar|não\s*aceito|não \s*aceitar)\s*(tudo|o)?\s*(opcional|(não[-\s](essencial|funcional|obrigatório|necessário)))?\s*$/is,
    // (deny) (all) (the) (optional) (cookies)
    /^\s*(rejeitar|recusar|desativar|bloquear|negar|não\s*aceito|não \s*aceitar)\s*(todos)?\s*(os)?\s*(cookies)?\s*(opcionais|(não[-\s](essenciais|funcionais|obrigatórios|necessários)))?\s*$/is,
    // (accept) (only) (the) (essential)
    /^\s*(aceitar|utilizar)?\s*(apenas|somente|só)?\s*(o)?\s*(essencial|funcional|obrigatório|necessário)\s*$/is,
    // (accept) (only) (the) (essential) (cookies)
    /^\s*(aceitar|utilizar)?\s*(apenas|somente|só)?\s*(os)?\s*(cookies)?\s*(essenciais|funcionais|obrigatórios|necessários)\s*$/is
  ];
  var REJECT_PATTERNS_SPANISH = [
    "rechazar",
    "rechazar todo",
    "rechazar todas",
    "denegar",
    "rechazar cookies",
    "rechazarlas todas",
    "no acepto",
    "rechazar todas las cookies",
    "rechazar y cerrar",
    "denegar todas",
    "solo necesarias",
    "rechazar cookies opcionales",
    "rechazar opcionales",
    "cookies estrictamente necesarias",
    "aceptar s\xF3lo necesarias",
    "denegar todo",
    "clear rechazar cookies",
    "configurar rechazar cookies",
    "denegar cookies",
    "rechazar y continuar",
    "rechazar las cookies",
    "clear rechazar",
    "denegar todas las cookies",
    "rechazar cookies no esenciales",
    "rechazarlas",
    "no, no acepto",
    "permitir s\xF3lo necesarias",
    "rechazar cookies adicionales",
    "rechazar cookies anal\xEDticas",
    "rechazar no necesarias",
    "rechazar opcional",
    "rechazar todo lo opcional",
    "solo cookies estrictamente necesarias",
    "solo esenciales",
    "x rechazar todas las cookies",
    "solo usar cookies necesarias",
    "solo cookies necesarias",
    "declinar",
    "aceptar solo las cookies esenciales",
    "necesarias",
    "aceptar cookies opcionales",
    "aceptar solo lo necesario",
    "solo funcionales",
    "declinar y cerrar",
    "d\xE9clin",
    "declina",
    "declinar consentimiento",
    "declinar todas",
    "solo las cookies necesarias",
    "nom\xE9s sutilitzen cookies quan \xE9s necessari",
    "no, s\xF3lo las estrictamente necesarias",
    "solo las necesarias",
    "acceptar nom\xE9s les necess\xE0ries",
    "acepta solo las necesarias",
    "aceptar solo lo esencial",
    "aceptar las obligatorias",
    "permitir solo cookies t\xE9cnicas",
    "cookies t\xE9cnicas",
    "permitir solo cookies t\xE9cnicas",
    "usar solo cookies t\xE9cnicas",
    "aceptar solo las esenciales"
  ];
  var REJECT_PATTERNS_SWEDISH = [
    "avvisa",
    "endast n\xF6dv\xE4ndiga",
    "avvisa alla",
    "endast n\xF6dv\xE4ndiga cookies",
    "neka",
    "neka alla",
    "avvisa allt",
    "avvisa alla cookies",
    "till\xE5t bara n\xF6dv\xE4ndiga cookies",
    "bara n\xF6dv\xE4ndiga",
    "bara n\xF6dv\xE4ndiga cookies",
    "till\xE5t bara n\xF6dv\xE4ndiga kakor",
    "endast n\xF6dv\xE4ndiga kakor",
    "till\xE5t endast n\xF6dv\xE4ndiga",
    "forts\xE4tt utan att acceptera",
    "godk\xE4nn endast n\xF6dv\xE4ndiga",
    "acceptera endast n\xF6dv\xE4ndiga",
    "avvisa cookies",
    "till\xE5t endast n\xF6dv\xE4ndiga kakor",
    "acceptera endast n\xF6dv\xE4ndiga cookies",
    "neka kakor",
    "bara n\xF6dv\xE4ndiga kakor",
    "neka alla cookies",
    "anv\xE4nd endast n\xF6dv\xE4ndiga",
    "avvisa alla utom n\xF6dv\xE4ndiga",
    "hantera eller avvisa",
    "neka alla utom n\xF6dv\xE4ndiga kakor",
    "neka och st\xE4ng",
    "till\xE5t bara n\xF6dv\xE4ndiga tj\xE4nster",
    "avvisa alla utom n\xF6dv\xE4ndiga kakor",
    "avvisa alla valfria",
    "godk\xE4nn bara n\xF6dv\xE4ndiga cookies",
    "acceptera endast n\xF6dv\xE4ndiga kakor",
    "anv\xE4nd endast n\xF6dv\xE4ndiga cookies",
    "avvisa alla kakor",
    "avvisa alla valm\xF6jligheter",
    "avvisa ej n\xF6dv\xE4ndiga",
    "avvisa icke-n\xF6dv\xE4ndiga",
    "f\xF6rneka",
    "godk\xE4nn bara n\xF6dv\xE4ndiga",
    "godk\xE4nn bara n\xF6dv\xE4ndiga kakor",
    "godk\xE4nn endast n\xF6dv\xE4ndiga cookies",
    "godk\xE4nn endast n\xF6dv\xE4ndiga kakor",
    "godta endast n\xF6dv\xE4ndiga",
    "jag godk\xE4nner bara n\xF6dv\xE4ndiga kakor",
    "nej, avvisa alla",
    "nej, bara n\xF6dv\xE4ndiga",
    "nej, bara n\xF6dv\xE4ndiga cookies",
    "neka alla utom n\xF6dv\xE4ndiga",
    "neka alla.",
    "neka cookies",
    "neka samtliga",
    "ok, endast n\xF6dv\xE4ndiga",
    "spara endast n\xF6dv\xE4ndiga",
    "st\xE4ng och avvisa",
    "till\xE5t bara n\xF6dv\xE4ndiga",
    "godk\xE4nn n\xF6dv\xE4ndiga kakor",
    "godk\xE4nn n\xF6dv\xE4ndiga",
    "acceptera n\xF6dv\xE4ndiga",
    "strikt n\xF6dv\xE4ndigt",
    "till\xE5t n\xF6dv\xE4ndiga",
    "n\xF6dv\xE4ndiga",
    "enbart n\xF6dv\xE4ndiga",
    "jag godk\xE4nner n\xF6dv\xE4ndiga kakor",
    "acceptera n\xF6dv\xE4ndiga kakor",
    "godk\xE4nn enbart n\xF6dv\xE4ndiga kakor",
    "godk\xE4nn n\xF6dv\xE4ndiga cookies",
    "om du inte vill acceptera andra cookies \xE4n de som \xE4r tekniskt n\xF6dv\xE4ndiga klickar du h\xE4r",
    "acceptera enbart n\xF6dv\xE4ndiga",
    "n\xF6dv\xE4ndiga cookies",
    "jag godk\xE4nner enbart att ni anv\xE4nder n\xF6dv\xE4ndiga cookies",
    "+ strikt n\xF6dv\xE4ndiga cookies",
    "anv\xE4nd enbart n\xF6dv\xE4ndiga cookies",
    "enbart n\xF6dv\xE4ndiga cookies",
    "godk\xE4nn n\xF6dv\xE4ndiga kakor st\xE4ng",
    "ok till n\xF6dv\xE4ndiga",
    "strikt n\xF6dv\xE4ndiga",
    "forts\xE4tt utan att godk\xE4nna",
    "avb\xF6j alla cookies",
    "jag accepterar endast grundl\xE4ggande kakor",
    "nej, jag avb\xF6jer",
    "till\xE5t inte cookies"
  ];
  var REJECT_PATTERNS = [
    ...REJECT_PATTERNS_ENGLISH,
    ...REJECT_PATTERNS_DUTCH,
    ...REJECT_PATTERNS_FRENCH,
    ...REJECT_PATTERNS_GERMAN,
    ...REJECT_PATTERNS_ITALIAN,
    ...REJECT_PATTERNS_BRAZILIAN_PORTUGUESE,
    ...REJECT_PATTERNS_SPANISH,
    ...REJECT_PATTERNS_SWEDISH
  ];
  var NEVER_MATCH_PATTERNS = [
    /pay|subscribe/is,
    /abonneer/is,
    /abonnier/is,
    /abonner/is,
    /abbonati/is,
    /iscriviti/is,
    /abbonare/is,
    /iscrivere/is,
    /sostienici/is,
    /suscribir/is
  ];

  // lib/heuristics.ts
  var BUTTON_LIKE_ELEMENT_SELECTOR = 'button, input[type="button"], input[type="submit"], a, [role="button"], [class*="button"]';
  var TEXT_LIMIT = 1e5;
  function checkHeuristicPatterns(allText, detectPatterns = DETECT_PATTERNS) {
    allText = allText.slice(0, TEXT_LIMIT);
    const patterns = [];
    const snippets2 = [];
    for (const p of detectPatterns) {
      const matches2 = allText?.match(p);
      if (matches2) {
        patterns.push(p.toString());
        snippets2.push(...matches2.map((m) => m.substring(0, 200)));
      }
    }
    return { patterns, snippets: snippets2 };
  }
  function getActionablePopups() {
    const popups = getPotentialPopups();
    const result = popups.reduce((acc, popup) => {
      const popupText = popup.text?.trim();
      if (popupText) {
        const { patterns } = checkHeuristicPatterns(popupText);
        if (patterns.length > 0) {
          const { rejectButtons, otherButtons } = classifyButtons(popup.buttons);
          if (rejectButtons.length > 0) {
            acc.push({
              ...popup,
              rejectButtons,
              otherButtons
            });
          }
        }
      }
      return acc;
    }, []);
    return result;
  }
  function classifyButtons(buttons) {
    const rejectButtons = [];
    const otherButtons = [];
    for (const button of buttons) {
      if (isRejectButton(button.text)) {
        rejectButtons.push(button);
      } else {
        otherButtons.push(button);
      }
    }
    return {
      rejectButtons,
      otherButtons
    };
  }
  function isRejectButton(buttonText, rejectPatterns = REJECT_PATTERNS, neverMatchPatterns = NEVER_MATCH_PATTERNS) {
    if (!buttonText) {
      return false;
    }
    const cleanedButtonText = cleanButtonText(buttonText);
    return !neverMatchPatterns.some((p) => p.test(cleanedButtonText)) && rejectPatterns.some((p) => p instanceof RegExp && p.test(cleanedButtonText) || p === cleanedButtonText);
  }
  function cleanButtonText(buttonText) {
    let result = buttonText.toLowerCase();
    result = result.replace(/[“”"'/#&[\]→✕×⟩❯><✗×‘’›«»]+/g, "");
    result = result.replace(
      /[\u{1F600}-\u{1F64F}\u{1F300}-\u{1F5FF}\u{1F680}-\u{1F6FF}\u{1F1E0}-\u{1F1FF}\u2600-\u26FF\u2700-\u27BF\u{1F900}-\u{1F9FF}\u{1FA70}-\u{1FAFF}]/gu,
      ""
    );
    result = result.replace(/\n+/g, " ");
    result = result.replace(/\s+/g, " ");
    result = result.trim();
    return result;
  }
  function getPotentialPopups() {
    const isFramed = !isTopFrame();
    if (isFramed && window.parent && window.parent !== window.top) {
      return [];
    }
    return collectPotentialPopups(isFramed);
  }
  function collectPotentialPopups(isFramed) {
    let elements = [];
    if (!isFramed) {
      elements = getPopupLikeElements();
    } else {
      const doc = document.body || document.documentElement;
      if (doc && isElementVisible(doc) && doc.innerText) {
        elements.push(doc);
      }
    }
    const potentialPopups = [];
    for (const el of elements) {
      if (el.innerText) {
        potentialPopups.push({
          text: el.innerText,
          element: el,
          buttons: getButtonData(el)
        });
      }
    }
    return potentialPopups;
  }
  function getPopupLikeElements() {
    const walker = document.createTreeWalker(
      document.documentElement,
      NodeFilter.SHOW_ELEMENT,
      // visit only element nodes
      {
        acceptNode(node) {
          if (node.tagName === "BODY") {
            return NodeFilter.FILTER_SKIP;
          }
          const cssPosition = window.getComputedStyle(node).position;
          if ((cssPosition === "fixed" || cssPosition === "sticky") && isElementVisible(node)) {
            return NodeFilter.FILTER_ACCEPT;
          }
          return NodeFilter.FILTER_SKIP;
        }
      }
    );
    const found = [];
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      found.push(node);
    }
    return excludeContainers(found);
  }
  function getButtonData(el) {
    const actionableButtons = excludeContainers(getButtonLikeElements(el)).filter(
      (b) => isElementVisible(b) && !isDisabled(b) && (b.innerText.trim() || // <input> values do not appear in innerText
      b instanceof HTMLInputElement && ["submit", "button"].includes(b.type) && b.value?.trim())
    );
    return actionableButtons.map((b) => ({
      text: (b.innerText || b.textContent || "").trim() || b.value?.trim() || "",
      element: b
    }));
  }
  function getButtonLikeElements(el) {
    return Array.from(el.querySelectorAll(BUTTON_LIKE_ELEMENT_SELECTOR));
  }
  function isDisabled(el) {
    return "disabled" in el && Boolean(el.disabled) || el.hasAttribute("disabled");
  }
  function excludeContainers(elements) {
    const results = [];
    if (elements.length > 0) {
      for (let i = elements.length - 1; i >= 0; i--) {
        let container = false;
        for (let j = 0; j < elements.length; j++) {
          if (i !== j && elements[i].contains(elements[j])) {
            container = true;
            break;
          }
        }
        if (!container) {
          results.push(elements[i]);
        }
      }
    }
    return results;
  }

  // lib/cmps/base.ts
  var defaultRunContext = {
    main: true,
    frame: false,
    urlPattern: ""
  };
  var AutoConsentCMPBase = class {
    constructor(autoconsentInstance) {
      this.name = "BASERULE";
      this.runContext = defaultRunContext;
      this.autoconsent = autoconsentInstance;
    }
    get hasSelfTest() {
      throw new Error("Not Implemented");
    }
    get isIntermediate() {
      throw new Error("Not Implemented");
    }
    get isCosmetic() {
      throw new Error("Not Implemented");
    }
    mainWorldEval(snippetId) {
      const snippet = snippets[snippetId];
      if (!snippet) {
        this.autoconsent.config.logs.errors && console.warn("Snippet not found", snippetId);
        return Promise.resolve(false);
      }
      const logsConfig = this.autoconsent.config.logs;
      if (this.autoconsent.config.isMainWorld) {
        logsConfig.evals && console.log("inline eval:", snippetId, snippet);
        let result = false;
        try {
          result = !!snippet.call(globalThis);
        } catch (e) {
          logsConfig.evals && console.error("error evaluating rule", snippetId, e);
        }
        return Promise.resolve(result);
      }
      const snippetSrc = getFunctionBody(snippet);
      logsConfig.evals && console.log("async eval:", snippetId, snippetSrc);
      return requestEval(snippetSrc, snippetId).catch((e) => {
        logsConfig.evals && console.error("error evaluating rule", snippetId, e);
        return false;
      });
    }
    checkRunContext() {
      if (!this.checkFrameContext(isTopFrame())) {
        return false;
      }
      if (this.runContext.urlPattern && !this.hasMatchingUrlPattern()) {
        return false;
      }
      return true;
    }
    checkFrameContext(isTop) {
      const runCtx = {
        ...defaultRunContext,
        ...this.runContext
      };
      if (isTop && !runCtx.main) {
        return false;
      }
      if (!isTop && !runCtx.frame) {
        return false;
      }
      return true;
    }
    hasMatchingUrlPattern() {
      return Boolean(this.runContext?.urlPattern && window.location.href.match(this.runContext.urlPattern));
    }
    detectCmp() {
      throw new Error("Not Implemented");
    }
    async detectPopup() {
      return false;
    }
    optOut() {
      throw new Error("Not Implemented");
    }
    optIn() {
      throw new Error("Not Implemented");
    }
    openCmp() {
      throw new Error("Not Implemented");
    }
    async test() {
      return Promise.resolve(true);
    }
    async highlightElements(elements, all = false, delayTimeout = 2e3) {
      if (elements.length === 0) {
        return;
      }
      if (!all) {
        elements = [elements[0]];
      }
      this.autoconsent.sendContentMessage({
        type: "visualDelay",
        timeout: delayTimeout
      });
      for (const el of elements) {
        this.autoconsent.config.logs.rulesteps && console.log("highlighting", el);
        highlightNode(el);
      }
      await this.wait(delayTimeout);
      for (const el of elements) {
        unhighlightNode(el);
      }
    }
    // Implementing DomActionsProvider below:
    async clickElement(element) {
      if (this.autoconsent.config.visualTest) {
        await this.highlightElements([element]);
      }
      this.autoconsent.updateState({ clicks: this.autoconsent.state.clicks + 1 });
      return this.autoconsent.domActions.clickElement(element);
    }
    async click(selector, all = false) {
      if (this.autoconsent.config.visualTest) {
        await this.highlightElements(this.elementSelector(selector), all);
      }
      this.autoconsent.updateState({ clicks: this.autoconsent.state.clicks + 1 });
      return this.autoconsent.domActions.click(selector, all);
    }
    elementExists(selector) {
      return this.autoconsent.domActions.elementExists(selector);
    }
    elementVisible(selector, check) {
      return this.autoconsent.domActions.elementVisible(selector, check);
    }
    waitForElement(selector, timeout) {
      return this.autoconsent.domActions.waitForElement(selector, timeout);
    }
    waitForVisible(selector, timeout, check) {
      return this.autoconsent.domActions.waitForVisible(selector, timeout, check);
    }
    async waitForThenClick(selector, timeout, all) {
      if (this.autoconsent.config.visualTest) {
        await this.highlightElements(this.elementSelector(selector), all);
      }
      this.autoconsent.updateState({ clicks: this.autoconsent.state.clicks + 1 });
      return this.autoconsent.domActions.waitForThenClick(selector, timeout, all);
    }
    wait(ms) {
      return this.autoconsent.domActions.wait(ms);
    }
    hide(selector, method) {
      return this.autoconsent.domActions.hide(selector, method);
    }
    cookieContains(substring) {
      return this.autoconsent.domActions.cookieContains(substring);
    }
    prehide(selector) {
      return this.autoconsent.domActions.prehide(selector);
    }
    undoPrehide() {
      return this.autoconsent.domActions.undoPrehide();
    }
    querySingleReplySelector(selector, parent) {
      return this.autoconsent.domActions.querySingleReplySelector(selector, parent);
    }
    querySelectorChain(selectors) {
      return this.autoconsent.domActions.querySelectorChain(selectors);
    }
    elementSelector(selector) {
      return this.autoconsent.domActions.elementSelector(selector);
    }
    waitForMutation(selector) {
      return this.autoconsent.domActions.waitForMutation(selector);
    }
  };
  var AutoConsentCMP = class extends AutoConsentCMPBase {
    constructor(rule, autoconsentInstance) {
      super(autoconsentInstance);
      this.rule = rule;
      this.name = rule.name;
      this.runContext = rule.runContext || defaultRunContext;
    }
    get hasSelfTest() {
      return !!this.rule.test && this.rule.test.length > 0;
    }
    get isIntermediate() {
      return !!this.rule.intermediate;
    }
    get isCosmetic() {
      return !!this.rule.cosmetic;
    }
    get prehideSelectors() {
      return this.rule.prehideSelectors || [];
    }
    async detectCmp() {
      if (this.rule.detectCmp) {
        return this._runRulesSequentially(this.rule.detectCmp, this.autoconsent.config.logs.detectionsteps);
      }
      return false;
    }
    async detectPopup() {
      if (this.rule.detectPopup) {
        return this._runRulesSequentially(this.rule.detectPopup, this.autoconsent.config.logs.detectionsteps);
      }
      return false;
    }
    async optOut() {
      const logsConfig = this.autoconsent.config.logs;
      if (this.rule.optOut) {
        logsConfig.lifecycle && console.log("Initiated optOut()", this.rule.optOut);
        return this._runRulesSequentially(this.rule.optOut, this.autoconsent.config.logs.rulesteps);
      }
      return false;
    }
    async optIn() {
      const logsConfig = this.autoconsent.config.logs;
      if (this.rule.optIn) {
        logsConfig.lifecycle && console.log("Initiated optIn()", this.rule.optIn);
        return this._runRulesSequentially(this.rule.optIn, this.autoconsent.config.logs.rulesteps);
      }
      return false;
    }
    async openCmp() {
      if (this.rule.openCmp) {
        return this._runRulesSequentially(this.rule.openCmp, this.autoconsent.config.logs.rulesteps);
      }
      return false;
    }
    async test() {
      if (this.hasSelfTest && this.rule.test) {
        return this._runRulesSequentially(this.rule.test, this.autoconsent.config.logs.rulesteps);
      }
      return super.test();
    }
    async evaluateRuleStep(rule) {
      const results = [];
      const logsConfig = this.autoconsent.config.logs;
      if (rule.exists) {
        results.push(this.elementExists(rule.exists));
      }
      if (rule.visible) {
        results.push(this.elementVisible(rule.visible, rule.check));
      }
      if (rule.eval) {
        const res = this.mainWorldEval(rule.eval);
        results.push(res);
      }
      if (rule.waitFor) {
        results.push(this.waitForElement(rule.waitFor, rule.timeout));
      }
      if (rule.waitForVisible) {
        results.push(this.waitForVisible(rule.waitForVisible, rule.timeout, rule.check));
      }
      if (rule.click) {
        results.push(this.click(rule.click, rule.all));
      }
      if (rule.waitForThenClick) {
        results.push(this.waitForThenClick(rule.waitForThenClick, rule.timeout, rule.all));
      }
      if (rule.wait) {
        results.push(this.wait(rule.wait));
      }
      if (rule.hide) {
        results.push(this.hide(rule.hide, rule.method));
      }
      if (rule.cookieContains) {
        results.push(this.cookieContains(rule.cookieContains));
      }
      if (rule.if) {
        if (!rule.if.exists && !rule.if.visible) {
          console.error("invalid conditional rule", rule.if);
          return false;
        }
        if (!rule.then) {
          console.error('invalid conditional rule, missing "then" step', rule.if);
          return false;
        }
        const condition = await this.evaluateRuleStep(rule.if);
        logsConfig.rulesteps && console.log("Condition is", condition);
        if (condition) {
          results.push(this._runRulesSequentially(rule.then, logsConfig.rulesteps));
        } else if (rule.else) {
          results.push(this._runRulesSequentially(rule.else, logsConfig.rulesteps));
        } else {
          results.push(true);
        }
      }
      if (rule.any) {
        let resultOfAny = false;
        for (const step of rule.any) {
          if (await this.evaluateRuleStep(step)) {
            resultOfAny = true;
            break;
          }
        }
        results.push(resultOfAny);
      }
      if (results.length === 0) {
        logsConfig.errors && console.warn("Unrecognized rule", rule);
        return false;
      }
      const all = await Promise.all(results);
      const result = all.reduce((a, b) => a && b, true);
      if (rule.negated) {
        return !result;
      }
      return result;
    }
    async _runRulesParallel(rules) {
      const results = rules.map((rule) => this.evaluateRuleStep(rule));
      const detections = await Promise.all(results);
      return detections.every((r) => !!r);
    }
    async _runRulesSequentially(rules, logSteps = true) {
      for (const rule of rules) {
        logSteps && console.log("Running rule...", rule);
        const result = await this.evaluateRuleStep(rule);
        logSteps && console.log("...rule result", result);
        if (!result && !rule.optional) {
          return false;
        }
      }
      return true;
    }
  };
  var AutoConsentHeuristicCMP = class extends AutoConsentCMPBase {
    constructor(autoconsentInstance) {
      super(autoconsentInstance);
      this.popups = [];
      this.name = "HEURISTIC";
      this.runContext = {
        main: true,
        frame: false
        // do not run in iframes for security reasons
      };
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    detectCmp() {
      this.popups = getActionablePopups();
      if (this.popups.length > 0) {
        return Promise.resolve(true);
      }
      return Promise.resolve(false);
    }
    async detectPopup() {
      if (this.popups.length > 0) {
        if (this.popups.length > 1 || this.popups[0].rejectButtons && this.popups[0].rejectButtons.length > 1) {
          this.autoconsent.config.logs.errors && console.warn("Heuristic found multiple reject buttons");
        }
        return true;
      }
      return false;
    }
    optOut() {
      const button = this.popups[0]?.rejectButtons?.[0];
      if (button) {
        return this.clickElement(button.element);
      }
      return Promise.resolve(false);
    }
    optIn() {
      throw new Error("Not Implemented");
    }
    openCmp() {
      throw new Error("Not Implemented");
    }
    async test() {
      const button = this.popups[0].rejectButtons?.[0];
      if (button) {
        await this.wait(500);
        return !isElementVisible(button.element);
      }
      return false;
    }
  };

  // lib/cmps/consentomatic.ts
  var ConsentOMaticCMP = class {
    constructor(name, config) {
      this.name = name;
      this.config = config;
      this.methods = /* @__PURE__ */ new Map();
      this.runContext = defaultRunContext;
      this.isCosmetic = false;
      config.methods.forEach((methodConfig) => {
        if (methodConfig.action) {
          this.methods.set(methodConfig.name, methodConfig.action);
        }
      });
      this.hasSelfTest = false;
    }
    get isIntermediate() {
      return false;
    }
    checkRunContext() {
      return true;
    }
    checkFrameContext(isTop) {
      return true;
    }
    hasMatchingUrlPattern() {
      return false;
    }
    async detectCmp() {
      const matchResults = this.config.detectors.map((detectorConfig) => matches(detectorConfig.presentMatcher));
      return matchResults.some((r) => !!r);
    }
    async detectPopup() {
      const matchResults = this.config.detectors.map((detectorConfig) => matches(detectorConfig.showingMatcher));
      return matchResults.some((r) => !!r);
    }
    async executeAction(method, param) {
      if (this.methods.has(method)) {
        return executeAction(this.methods.get(method), param);
      }
      return true;
    }
    async optOut() {
      await this.executeAction("HIDE_CMP");
      await this.executeAction("OPEN_OPTIONS");
      await this.executeAction("HIDE_CMP");
      await this.executeAction("DO_CONSENT", []);
      await this.executeAction("SAVE_CONSENT");
      return true;
    }
    async optIn() {
      await this.executeAction("HIDE_CMP");
      await this.executeAction("OPEN_OPTIONS");
      await this.executeAction("HIDE_CMP");
      await this.executeAction("DO_CONSENT", ["D", "A", "B", "E", "F", "X"]);
      await this.executeAction("SAVE_CONSENT");
      return true;
    }
    async openCmp() {
      await this.executeAction("HIDE_CMP");
      await this.executeAction("OPEN_OPTIONS");
      return true;
    }
    async test() {
      return true;
    }
  };

  // lib/rules.ts
  var SUPPORTED_RULE_STEP_VERSION = 1;

  // lib/cmps/trustarc-top.ts
  var cookieSettingsButton = "#truste-show-consent";
  var shortcutOptOut = "#truste-consent-required";
  var shortcutOptIn = "#truste-consent-button";
  var popupContent = "#truste-consent-content";
  var bannerOverlay = "#trustarc-banner-overlay";
  var bannerContainer = "#truste-consent-track";
  var TrustArcTop = class extends AutoConsentCMPBase {
    constructor(autoconsentInstance) {
      super(autoconsentInstance);
      this.name = "TrustArc-top";
      this.prehideSelectors = [".trustarc-banner-container", `.truste_popframe,.truste_overlay,.truste_box_overlay,${bannerContainer}`];
      this.runContext = {
        main: true,
        frame: false
      };
      this._shortcutButton = null;
      this._optInDone = false;
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      if (this._optInDone) {
        return false;
      }
      return !this._shortcutButton;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      const result = this.elementExists(`${cookieSettingsButton},${bannerContainer}`);
      if (result) {
        this._shortcutButton = document.querySelector(shortcutOptOut);
      }
      return result;
    }
    async detectPopup() {
      return this.elementVisible(`${popupContent},${bannerOverlay},${bannerContainer}`, "any");
    }
    async optOut() {
      if (this._shortcutButton) {
        this._shortcutButton.click();
        return true;
      }
      hideElements(getStyleElement(), `.truste_popframe, .truste_overlay, .truste_box_overlay, ${bannerContainer}`);
      await this.click(cookieSettingsButton);
      setTimeout(() => {
        getStyleElement().remove();
      }, 1e4);
      return true;
    }
    async optIn() {
      this._optInDone = true;
      return await this.click(shortcutOptIn);
    }
    async openCmp() {
      return true;
    }
    async test() {
      await this.wait(500);
      return await this.mainWorldEval("EVAL_TRUSTARC_TOP");
    }
  };

  // lib/cmps/trustarc-frame.ts
  var TrustArcFrame = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "TrustArc-frame";
      this.runContext = {
        main: false,
        frame: true,
        urlPattern: "^https://consent-pref\\.trustarc\\.com/\\?"
      };
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      return true;
    }
    async detectPopup() {
      return this.elementVisible("#defaultpreferencemanager", "any") && this.elementVisible(".mainContent", "any");
    }
    async navigateToSettings() {
      await waitFor(
        async () => {
          return this.elementExists(".shp") || this.elementVisible(".advance", "any") || this.elementExists(".switch span:first-child");
        },
        10,
        500
      );
      if (this.elementExists(".shp")) {
        await this.click(".shp");
      }
      await this.waitForElement(".prefPanel", 5e3);
      if (this.elementVisible(".advance", "any")) {
        await this.click(".advance");
      }
      return await waitFor(() => this.elementVisible(".switch span:first-child", "any"), 5, 1e3);
    }
    async optOut() {
      if (await this.mainWorldEval("EVAL_TRUSTARC_FRAME_TEST")) {
        return true;
      }
      let timeout = 3e3;
      if (await this.mainWorldEval("EVAL_TRUSTARC_FRAME_GTM")) {
        timeout = 1500;
      }
      await waitFor(() => document.readyState === "complete", 20, 100);
      await this.waitForElement(".mainContent[aria-hidden=false]", timeout);
      if (await this.click(".rejectAll")) {
        return true;
      }
      if (this.elementExists(".prefPanel")) {
        await this.waitForElement('.prefPanel[style="visibility: visible;"]', timeout);
      }
      if (await this.click("#catDetails0")) {
        await this.click(".submit");
        this.waitForThenClick("#gwt-debug-close_id", timeout);
        return true;
      }
      if (await this.click(".required")) {
        this.waitForThenClick("#gwt-debug-close_id", timeout);
        return true;
      }
      await this.navigateToSettings();
      await this.click(".switch span:nth-child(1):not(.active)", true);
      await this.click(".submit");
      this.waitForThenClick("#gwt-debug-close_id", timeout * 10);
      return true;
    }
    async optIn() {
      if (await this.click(".call")) {
        return true;
      }
      await this.navigateToSettings();
      await this.click(".switch span:nth-child(2)", true);
      await this.click(".submit");
      this.waitForElement("#gwt-debug-close_id", 3e5).then(() => {
        this.click("#gwt-debug-close_id");
      });
      return true;
    }
    async test() {
      await this.wait(500);
      return await this.mainWorldEval("EVAL_TRUSTARC_FRAME_TEST");
    }
  };

  // lib/cmps/cookiebot.ts
  var Cookiebot = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "Cybotcookiebot";
      this.prehideSelectors = [
        "#CybotCookiebotDialog,#CybotCookiebotDialogBodyUnderlay,#dtcookie-container,#cookiebanner,#cb-cookieoverlay,.modal--cookie-banner,#cookiebanner_outer,#CookieBanner"
      ];
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      return await this.mainWorldEval("EVAL_COOKIEBOT_1");
    }
    async detectPopup() {
      return this.mainWorldEval("EVAL_COOKIEBOT_2");
    }
    async optOut() {
      if (this.elementVisible("#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll")) {
        return await this.click("#CybotCookiebotDialogBodyLevelButtonLevelOptinDeclineAll");
      }
      await this.wait(500);
      let res = await this.mainWorldEval("EVAL_COOKIEBOT_3");
      await this.wait(1e3);
      res = res && await this.mainWorldEval("EVAL_COOKIEBOT_4");
      return res;
    }
    async optIn() {
      if (this.elementExists("#dtcookie-container")) {
        return await this.click(".h-dtcookie-accept");
      }
      await this.click(".CybotCookiebotDialogBodyLevelButton:not(:checked):enabled", true);
      await this.click("#CybotCookiebotDialogBodyLevelButtonAccept");
      await this.click("#CybotCookiebotDialogBodyButtonAccept");
      return true;
    }
    async test() {
      await this.wait(500);
      return await this.mainWorldEval("EVAL_COOKIEBOT_5");
    }
  };

  // lib/cmps/sourcepoint-frame.ts
  var SourcePoint = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "Sourcepoint-frame";
      this.prehideSelectors = ["div[id^='sp_message_container_'],.message-overlay", "#sp_privacy_manager_container"];
      this.ccpaNotice = false;
      this.ccpaPopup = false;
      this.runContext = {
        main: true,
        frame: true
      };
    }
    get hasSelfTest() {
      return false;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      const url = new URL(location.href);
      if (url.searchParams.has("message_id") && url.hostname === "ccpa-notice.sp-prod.net") {
        this.ccpaNotice = true;
        return true;
      }
      if (url.hostname === "ccpa-pm.sp-prod.net") {
        this.ccpaPopup = true;
        return true;
      }
      return (url.pathname === "/index.html" || url.pathname === "/privacy-manager/index.html" || url.pathname === "/ccpa_pm/index.html" || url.pathname === "/us_pm/index.html") && (url.searchParams.has("message_id") || url.searchParams.has("requestUUID") || url.searchParams.has("consentUUID"));
    }
    async detectPopup() {
      if (this.ccpaNotice) {
        return true;
      }
      if (this.ccpaPopup) {
        return await this.waitForElement(".priv-save-btn", 2e3);
      }
      await this.waitForElement(
        ".sp_choice_type_11,.sp_choice_type_12,.sp_choice_type_13,.sp_choice_type_ACCEPT_ALL,.sp_choice_type_SAVE_AND_EXIT",
        2e3
      );
      return !this.elementExists(".sp_choice_type_9");
    }
    async optIn() {
      await this.waitForElement(".sp_choice_type_11,.sp_choice_type_ACCEPT_ALL", 2e3);
      if (await this.click(".sp_choice_type_11")) {
        return true;
      }
      if (await this.click(".sp_choice_type_ACCEPT_ALL")) {
        return true;
      }
      return false;
    }
    isManagerOpen() {
      return location.pathname === "/privacy-manager/index.html" || location.pathname === "/ccpa_pm/index.html";
    }
    async optOut() {
      await this.wait(500);
      const logsConfig = this.autoconsent.config.logs;
      if (this.ccpaPopup) {
        const toggles = document.querySelectorAll(
          ".priv-purpose-container .sp-switch-arrow-block a.neutral.on .right"
        );
        for (const t of toggles) {
          t.click();
        }
        const switches = document.querySelectorAll(
          ".priv-purpose-container .sp-switch-arrow-block a.switch-bg.on"
        );
        for (const t of switches) {
          t.click();
        }
        return await this.click(".priv-save-btn");
      }
      if (this.elementVisible(".sp_choice_type_SE", "any")) {
        await this.click(
          [
            "xpath///div[contains(., 'Do not share my personal information') and contains(@class, 'switch-container')]",
            ".pm-switch[aria-checked=false] .slider"
          ],
          false
        );
        return await this.click(".sp_choice_type_SE");
      }
      if (!this.isManagerOpen()) {
        const actionable = await this.waitForVisible('.sp_choice_type_12,.sp_choice_type_13,[data-choice="1739968508799"]');
        if (!actionable) {
          return false;
        }
        if (!this.elementExists('.sp_choice_type_12,[data-choice="1739968508799"]')) {
          return await this.click(".sp_choice_type_13");
        }
        await this.click('.sp_choice_type_12,[data-choice="1739968508799"]');
        await waitFor(() => this.isManagerOpen(), 200, 100);
      }
      await this.waitForElement(".type-modal", 2e4);
      if (this.elementExists("[role=tablist]")) {
        await this.waitForElement("[role=tablist] [role=tab]", 1e4);
      }
      this.waitForThenClick(".ccpa-stack .pm-switch[aria-checked=true] .slider", 500, true);
      try {
        const rejectSelector1 = ".sp_choice_type_REJECT_ALL";
        const rejectSelector2 = ".reject-toggle";
        const path = await Promise.race([
          this.waitForElement(rejectSelector1, 2e3).then((success) => success ? 0 : -1),
          this.waitForElement(rejectSelector2, 2e3).then((success) => success ? 1 : -1),
          this.waitForElement(".pm-features", 2e3).then((success) => success ? 2 : -1)
        ]);
        if (path === 0) {
          await this.waitForVisible(rejectSelector1);
          return await this.click(rejectSelector1);
        } else if (path === 1) {
          await this.click(rejectSelector2);
        } else if (path === 2) {
          await this.waitForElement(".pm-features", 1e4);
          await this.click(".checked > span", true);
          await this.click(".chevron");
        }
      } catch (e) {
        logsConfig.errors && console.warn(e);
      }
      return await this.click(".sp_choice_type_SAVE_AND_EXIT");
    }
  };

  // lib/cmps/consentmanager.ts
  var ConsentManager = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "consentmanager.net";
      this.prehideSelectors = ["#cmpbox,#cmpbox2"];
      this.apiAvailable = false;
    }
    get hasSelfTest() {
      return this.apiAvailable;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      this.apiAvailable = await this.mainWorldEval("EVAL_CONSENTMANAGER_1");
      if (!this.apiAvailable) {
        return this.elementExists("#cmpbox");
      } else {
        return true;
      }
    }
    async detectPopup() {
      if (this.elementVisible("#cmpbox .cmpmore", "any")) {
        return true;
      } else if (this.apiAvailable) {
        await this.wait(500);
        return await this.mainWorldEval("EVAL_CONSENTMANAGER_2");
      }
      return false;
    }
    async optOut() {
      await this.wait(500);
      if (this.apiAvailable) {
        return await this.mainWorldEval("EVAL_CONSENTMANAGER_3");
      }
      if (await this.click(".cmpboxbtnno")) {
        return true;
      }
      if (this.elementExists(".cmpwelcomeprpsbtn")) {
        await this.click(".cmpwelcomeprpsbtn > a[aria-checked=true]", true);
        await this.click(".cmpboxbtnsave");
        return true;
      }
      await this.click(".cmpboxbtncustom");
      await this.waitForElement(".cmptblbox", 2e3);
      await this.click(".cmptdchoice > a[aria-checked=true]", true);
      await this.click(".cmpboxbtnyescustomchoices");
      this.hide("#cmpwrapper,#cmpbox", "display");
      return true;
    }
    async optIn() {
      if (this.apiAvailable) {
        return await this.mainWorldEval("EVAL_CONSENTMANAGER_4");
      }
      return await this.click(".cmpboxbtnyes");
    }
    async test() {
      if (this.apiAvailable) {
        return await this.mainWorldEval("EVAL_CONSENTMANAGER_5");
      }
      return false;
    }
  };

  // lib/cmps/evidon.ts
  var Evidon = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "Evidon";
    }
    get hasSelfTest() {
      return false;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      return this.elementExists("#_evidon_banner");
    }
    async detectPopup() {
      return this.elementVisible("#_evidon_banner", "any");
    }
    async optOut() {
      if (await this.click("#_evidon-decline-button")) {
        return true;
      }
      hideElements(getStyleElement(), "#evidon-prefdiag-overlay,#evidon-prefdiag-background,#_evidon-background");
      await this.waitForThenClick("#_evidon-option-button");
      await this.waitForElement("#evidon-prefdiag-overlay", 5e3);
      await this.wait(500);
      await this.waitForThenClick("#evidon-prefdiag-decline");
      return true;
    }
    async optIn() {
      return await this.click("#_evidon-accept-button");
    }
  };

  // lib/cmps/onetrust.ts
  var Onetrust = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "Onetrust";
      this.prehideSelectors = ["#onetrust-banner-sdk,#onetrust-consent-sdk,.onetrust-pc-dark-filter,.js-consent-banner"];
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      return this.elementExists("#onetrust-banner-sdk,#onetrust-pc-sdk");
    }
    async detectPopup() {
      return this.elementVisible("#onetrust-banner-sdk,#onetrust-pc-sdk", "any");
    }
    async optOut() {
      if (this.elementVisible("#onetrust-reject-all-handler,.ot-pc-refuse-all-handler,.js-reject-cookies", "any")) {
        return await this.click("#onetrust-reject-all-handler,.ot-pc-refuse-all-handler,.js-reject-cookies");
      }
      if (this.elementExists("#onetrust-pc-btn-handler")) {
        await this.click("#onetrust-pc-btn-handler");
      } else {
        await this.click(".ot-sdk-show-settings,button.js-cookie-settings");
      }
      await this.waitForElement("#onetrust-consent-sdk", 2e3);
      await this.wait(1e3);
      await this.click("#onetrust-consent-sdk input.category-switch-handler:checked,.js-editor-toggle-state:checked", true);
      await this.wait(1e3);
      await this.waitForElement(".save-preference-btn-handler,.js-consent-save", 2e3);
      await this.click(".save-preference-btn-handler,.js-consent-save");
      await this.waitForVisible("#onetrust-banner-sdk", 5e3, "none");
      return true;
    }
    async optIn() {
      return await this.click("#onetrust-accept-btn-handler,#accept-recommended-btn-handler,.js-accept-cookies");
    }
    async test() {
      return await waitFor(() => this.mainWorldEval("EVAL_ONETRUST_1"), 10, 500);
    }
  };

  // lib/cmps/klaro.ts
  var Klaro = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "Klaro";
      this.prehideSelectors = [".klaro"];
      this.settingsOpen = false;
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      if (this.elementExists(".klaro > .cookie-modal")) {
        this.settingsOpen = true;
        return true;
      }
      return this.elementExists(".klaro > .cookie-notice");
    }
    async detectPopup() {
      return this.elementVisible(".klaro > .cookie-notice,.klaro > .cookie-modal", "any");
    }
    async optOut() {
      const apiOptOutSuccess = await this.mainWorldEval("EVAL_KLARO_TRY_API_OPT_OUT");
      if (apiOptOutSuccess) {
        return true;
      }
      if (await this.click(".klaro .cn-decline")) {
        return true;
      }
      await this.mainWorldEval("EVAL_KLARO_OPEN_POPUP");
      if (await this.click(".klaro .cn-decline")) {
        return true;
      }
      await this.click(
        ".cm-purpose:not(.cm-toggle-all) > input:not(.half-checked,.required,.only-required),.cm-purpose:not(.cm-toggle-all) > div > input:not(.half-checked,.required,.only-required)",
        true
      );
      return await this.click(".cm-btn-accept,.cm-button");
    }
    async optIn() {
      if (await this.click(".klaro .cm-btn-accept-all")) {
        return true;
      }
      if (this.settingsOpen) {
        await this.click(".cm-purpose:not(.cm-toggle-all) > input.half-checked", true);
        return await this.click(".cm-btn-accept");
      }
      return await this.click(".klaro .cookie-notice .cm-btn-success");
    }
    async test() {
      return await this.mainWorldEval("EVAL_KLARO_1");
    }
  };

  // lib/cmps/uniconsent.ts
  var Uniconsent = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "Uniconsent";
    }
    get prehideSelectors() {
      return [".unic", ".modal:has(.unic)"];
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      return this.elementExists(".unic .unic-box,.unic .unic-bar,.unic .unic-modal");
    }
    async detectPopup() {
      return this.elementVisible(".unic .unic-box,.unic .unic-bar,.unic .unic-modal", "any");
    }
    async optOut() {
      await this.waitForElement(".unic button", 1e3);
      document.querySelectorAll(".unic button").forEach((button) => {
        const text = button.textContent;
        if (text.includes("Manage Options") || text.includes("Optionen verwalten")) {
          button.click();
        }
      });
      if (await this.waitForElement(".unic input[type=checkbox]", 1e3)) {
        await this.waitForElement(".unic button", 1e3);
        document.querySelectorAll(".unic input[type=checkbox]").forEach((c) => {
          if (c.checked) {
            c.click();
          }
        });
        for (const b of document.querySelectorAll(".unic button")) {
          const text = b.textContent;
          for (const pattern of ["Confirm Choices", "Save Choices", "Auswahl speichern"]) {
            if (text.includes(pattern)) {
              b.click();
              await this.wait(500);
              return true;
            }
          }
        }
      }
      return false;
    }
    async optIn() {
      return this.waitForThenClick(".unic #unic-agree");
    }
    async test() {
      await this.wait(1e3);
      const res = this.elementExists(".unic .unic-box,.unic .unic-bar");
      return !res;
    }
  };

  // lib/cmps/conversant.ts
  var Conversant = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.prehideSelectors = [".cmp-root"];
      this.name = "Conversant";
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      return this.elementExists(".cmp-root .cmp-receptacle");
    }
    async detectPopup() {
      return this.elementVisible(".cmp-root .cmp-receptacle", "any");
    }
    async optOut() {
      if (!await this.waitForThenClick(".cmp-main-button:not(.cmp-main-button--primary)")) {
        return false;
      }
      if (!await this.waitForElement(".cmp-view-tab-tabs")) {
        return false;
      }
      await this.waitForThenClick(".cmp-view-tab-tabs > :first-child");
      await this.waitForThenClick(".cmp-view-tab-tabs > .cmp-view-tab--active:first-child");
      for (const item of Array.from(document.querySelectorAll(".cmp-accordion-item"))) {
        item.querySelector(".cmp-accordion-item-title").click();
        await waitFor(() => !!item.querySelector(".cmp-accordion-item-content.cmp-active"), 10, 50);
        const content = item.querySelector(".cmp-accordion-item-content.cmp-active");
        content.querySelectorAll(".cmp-toggle-actions .cmp-toggle-deny:not(.cmp-toggle-deny--active)").forEach((e) => e.click());
        content.querySelectorAll(".cmp-toggle-actions .cmp-toggle-checkbox:not(.cmp-toggle-checkbox--active)").forEach((e) => e.click());
      }
      await this.click(".cmp-main-button:not(.cmp-main-button--primary)");
      return true;
    }
    async optIn() {
      return this.waitForThenClick(".cmp-main-button.cmp-main-button--primary");
    }
    async test() {
      return document.cookie.includes("cmp-data=0");
    }
  };

  // lib/cmps/tiktok.ts
  var Tiktok = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "tiktok.com";
      this.runContext = {
        urlPattern: "tiktok"
      };
    }
    get hasSelfTest() {
      return true;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    getShadowRoot() {
      const container = document.querySelector("tiktok-cookie-banner");
      if (!container) {
        return null;
      }
      return container.shadowRoot;
    }
    async detectCmp() {
      return this.elementExists("tiktok-cookie-banner");
    }
    async detectPopup() {
      const banner = this.getShadowRoot()?.querySelector(".tiktok-cookie-banner");
      return isElementVisible(banner);
    }
    async optOut() {
      const logsConfig = this.autoconsent.config.logs;
      const declineButton = this.getShadowRoot()?.querySelector(".button-wrapper button:first-child");
      if (declineButton) {
        logsConfig.rulesteps && console.log("[clicking]", declineButton);
        declineButton.click();
        return true;
      } else {
        logsConfig.errors && console.log("no decline button found");
        return false;
      }
    }
    async optIn() {
      const logsConfig = this.autoconsent.config.logs;
      const acceptButton = this.getShadowRoot()?.querySelector(".button-wrapper button:last-child");
      if (acceptButton) {
        logsConfig.rulesteps && console.log("[clicking]", acceptButton);
        acceptButton.click();
        return true;
      } else {
        logsConfig.errors && console.log("no accept button found");
        return false;
      }
    }
    async test() {
      const match = document.cookie.match(/cookie-consent=([^;]+)/);
      if (!match) {
        return false;
      }
      const value = JSON.parse(decodeURIComponent(match[1]));
      return Object.values(value).every((x) => typeof x !== "boolean" || x === false);
    }
  };

  // lib/cmps/tumblr-com.ts
  var Tumblr = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "tumblr-com";
      this.runContext = {
        urlPattern: "^https://(www\\.)?tumblr\\.com/"
      };
    }
    get hasSelfTest() {
      return false;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    get prehideSelectors() {
      return ["#cmp-app-container"];
    }
    async detectCmp() {
      return this.elementExists("#cmp-app-container");
    }
    async detectPopup() {
      return this.elementVisible("#cmp-app-container", "any");
    }
    async optOut() {
      let iframe = document.querySelector("#cmp-app-container iframe");
      let settingsButton = iframe?.contentDocument?.querySelector(".cmp-components-button.is-secondary");
      if (!settingsButton) {
        return false;
      }
      settingsButton.click();
      await waitFor(
        () => {
          const iframe2 = document.querySelector("#cmp-app-container iframe");
          return !!iframe2?.contentDocument?.querySelector(".cmp__dialog input");
        },
        5,
        500
      );
      iframe = document.querySelector("#cmp-app-container iframe");
      settingsButton = iframe?.contentDocument?.querySelector(".cmp-components-button.is-secondary");
      if (!settingsButton) {
        return false;
      }
      settingsButton.click();
      return true;
    }
    async optIn() {
      const iframe = document.querySelector("#cmp-app-container iframe");
      const acceptButton = iframe?.contentDocument?.querySelector(".cmp-components-button.is-primary");
      if (acceptButton) {
        acceptButton.click();
        return true;
      }
      return false;
    }
  };

  // lib/cmps/admiral.ts
  var Admiral = class extends AutoConsentCMPBase {
    constructor() {
      super(...arguments);
      this.name = "Admiral";
    }
    get hasSelfTest() {
      return false;
    }
    get isIntermediate() {
      return false;
    }
    get isCosmetic() {
      return false;
    }
    async detectCmp() {
      return this.elementExists("div > div[class*=Card] > div[class*=Frame] > div[class*=Pills] > button[class*=Pills__StyledPill]");
    }
    async detectPopup() {
      return this.elementVisible(
        "div > div[class*=Card] > div[class*=Frame] > div[class*=Pills] > button[class*=Pills__StyledPill]",
        "any"
      );
    }
    async optOut() {
      const rejectAllSelector = "xpath///button[contains(., 'Afvis alle') or contains(., 'Reject all') or contains(., 'Odbaci sve') or contains(., 'Rechazar todo') or contains(., 'Atmesti visus') or contains(., 'Odm\xEDtnout v\u0161e') or contains(., '\u0391\u03C0\u03CC\u03C1\u03C1\u03B9\u03C8\u03B7 \u03CC\u03BB\u03C9\u03BD') or contains(., 'Rejeitar tudo') or contains(., 'T\xFCm\xFCn\xFC reddet') or contains(., '\u041E\u0442\u043A\u043B\u043E\u043D\u0438\u0442\u044C \u0432\u0441\u0435') or contains(., 'Noraid\u012Bt visu') or contains(., 'Avvisa alla') or contains(., 'Odrzu\u0107 wszystkie') or contains(., 'Alles afwijzen') or contains(., '\u041E\u0442\u0445\u0432\u044A\u0440\u043B\u044F\u043D\u0435 \u043D\u0430 \u0432\u0441\u0438\u0447\u043A\u0438') or contains(., 'Rifiuta tutto') or contains(., 'Zavrni vse') or contains(., 'Az \xF6sszes elutas\xEDt\xE1sa') or contains(., 'Respinge\u021Bi tot') or contains(., 'Alles ablehnen') or contains(., 'Tout rejeter') or contains(., 'Odmietnu\u0165 v\u0161etko') or contains(., 'L\xFCkka k\xF5ik tagasi') or contains(., 'Hylk\xE4\xE4 kaikki')]";
      if (await this.waitForElement(rejectAllSelector, 500)) {
        return await this.click(rejectAllSelector);
      }
      const purposesButtonSelector = "xpath///button[contains(., 'Zwecke') or contains(., '\u03A3\u03BA\u03BF\u03C0\u03BF\u03AF') or contains(., 'Purposes') or contains(., '\u0426\u0435\u043B\u0438') or contains(., 'Eesm\xE4rgid') or contains(., 'Tikslai') or contains(., 'Svrhe') or contains(., 'Cele') or contains(., '\xDA\u010Dely') or contains(., 'Finalidades') or contains(., 'M\u0113r\u0137i') or contains(., 'Scopuri') or contains(., 'Fines') or contains(., '\xC4ndam\xE5l') or contains(., 'Finalit\xE9s') or contains(., 'Doeleinden') or contains(., 'Tarkoitukset') or contains(., 'Scopi') or contains(., 'Ama\xE7lar') or contains(., 'Nameni') or contains(., 'C\xE9lok') or contains(., 'Form\xE5l')]";
      const saveAndExitSelector = "xpath///button[contains(., 'Spara & avsluta') or contains(., 'Save & exit') or contains(., 'Ulo\u017Eit a ukon\u010Dit') or contains(., 'Enregistrer et quitter') or contains(., 'Speichern & Verlassen') or contains(., 'Tallenna ja poistu') or contains(., 'I\u0161saugoti ir i\u0161eiti') or contains(., 'Opslaan & afsluiten') or contains(., 'Guardar y salir') or contains(., 'Shrani in zapri') or contains(., 'Ulo\u017Ei\u0165 a ukon\u010Di\u0165') or contains(., 'Kaydet ve \xE7\u0131k\u0131\u015F yap') or contains(., '\u0421\u043E\u0445\u0440\u0430\u043D\u0438\u0442\u044C \u0438 \u0432\u044B\u0439\u0442\u0438') or contains(., 'Salvesta ja v\xE4lju') or contains(., 'Salva ed esci') or contains(., 'Gem & afslut') or contains(., '\u0391\u03C0\u03BF\u03B8\u03AE\u03BA\u03B5\u03C5\u03C3\u03B7 \u03BA\u03B1\u03B9 \u03AD\u03BE\u03BF\u03B4\u03BF\u03C2') or contains(., 'Saglab\u0101t un iziet') or contains(., 'Ment\xE9s \xE9s kil\xE9p\xE9s') or contains(., 'Guardar e sair') or contains(., 'Zapisz & zako\u0144cz') or contains(., 'Salvare \u0219i ie\u0219ire') or contains(., 'Spremi i iza\u0111i') or contains(., '\u0417\u0430\u043F\u0430\u0437\u0432\u0430\u043D\u0435 \u0438 \u0438\u0437\u0445\u043E\u0434')]";
      if (await this.waitForThenClick(purposesButtonSelector) && await this.waitForVisible(saveAndExitSelector)) {
        const popupBody = this.elementSelector(saveAndExitSelector)[0].parentElement?.parentElement;
        const checkboxes = popupBody?.querySelectorAll("input[type=checkbox]:checked");
        checkboxes?.forEach((checkbox) => checkbox.click());
        return await this.click(saveAndExitSelector);
      }
      return false;
    }
    async optIn() {
      return await this.click(
        "xpath///button[contains(., 'Sprejmi vse') or contains(., 'Prihvati sve') or contains(., 'Godk\xE4nn alla') or contains(., 'Prija\u0165 v\u0161etko') or contains(., '\u041F\u0440\u0438\u043D\u044F\u0442\u044C \u0432\u0441\u0435') or contains(., 'Aceptar todo') or contains(., '\u0391\u03C0\u03BF\u03B4\u03BF\u03C7\u03AE \u03CC\u03BB\u03C9\u03BD') or contains(., 'Zaakceptuj wszystkie') or contains(., 'Accetta tutto') or contains(., 'Priimti visus') or contains(., 'Pie\u0146emt visu') or contains(., 'T\xFCm\xFCn\xFC kabul et') or contains(., 'Az \xF6sszes elfogad\xE1sa') or contains(., 'Accept all') or contains(., '\u041F\u0440\u0438\u0435\u043C\u0430\u043D\u0435 \u043D\u0430 \u0432\u0441\u0438\u0447\u043A\u0438') or contains(., 'Accepter alle') or contains(., 'Hyv\xE4ksy kaikki') or contains(., 'Tout accepter') or contains(., 'Alles accepteren') or contains(., 'Aktsepteeri k\xF5ik') or contains(., 'P\u0159ijmout v\u0161e') or contains(., 'Alles akzeptieren') or contains(., 'Aceitar tudo') or contains(., 'Accepta\u021Bi tot')]"
      );
    }
  };

  // lib/cmps/all.ts
  var dynamicCMPs = [
    TrustArcTop,
    TrustArcFrame,
    Cookiebot,
    SourcePoint,
    ConsentManager,
    Evidon,
    Onetrust,
    Klaro,
    Uniconsent,
    Conversant,
    Tiktok,
    Tumblr,
    Admiral
  ];

  // lib/dom-actions.ts
  var DomActions = class {
    constructor(autoconsentInstance) {
      this.autoconsentInstance = autoconsentInstance;
    }
    async clickElement(element) {
      if (!element || !(element instanceof HTMLElement)) {
        return false;
      }
      this.autoconsentInstance.config.logs.rulesteps && console.log("[clickElement]", element);
      element.click();
      return true;
    }
    async click(selector, all = false) {
      const elements = this.elementSelector(selector);
      this.autoconsentInstance.config.logs.rulesteps && console.log("[click]", selector, all, elements);
      if (elements.length > 0) {
        if (all) {
          elements.forEach((e) => e.click());
        } else {
          elements[0].click();
        }
      }
      return elements.length > 0;
    }
    elementExists(selector) {
      const exists = this.elementSelector(selector).length > 0;
      return exists;
    }
    elementVisible(selector, check = "all") {
      const elem = this.elementSelector(selector);
      const results = new Array(elem.length);
      elem.forEach((e, i) => {
        results[i] = isElementVisible(e);
      });
      if (check === "none") {
        return results.every((r) => !r);
      } else if (results.length === 0) {
        return false;
      } else if (check === "any") {
        return results.some((r) => r);
      }
      return results.every((r) => r);
    }
    waitForElement(selector, timeout = 1e4) {
      const interval = 200;
      const times = Math.ceil(timeout / interval);
      this.autoconsentInstance.config.logs.rulesteps && console.log("[waitForElement]", selector);
      return waitFor(() => this.elementSelector(selector).length > 0, times, interval);
    }
    waitForVisible(selector, timeout = 1e4, check = "any") {
      const interval = 200;
      const times = Math.ceil(timeout / interval);
      this.autoconsentInstance.config.logs.rulesteps && console.log("[waitForVisible]", selector);
      return waitFor(() => this.elementVisible(selector, check), times, interval);
    }
    async waitForThenClick(selector, timeout = 1e4, all = false) {
      await this.waitForElement(selector, timeout);
      return await this.click(selector, all);
    }
    wait(ms) {
      this.autoconsentInstance.config.logs.rulesteps && this.autoconsentInstance.config.logs.waits && console.log("[wait]", ms);
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve(true);
        }, ms);
      });
    }
    cookieContains(substring) {
      return document.cookie.includes(substring);
    }
    hide(selector, method) {
      this.autoconsentInstance.config.logs.rulesteps && console.log("[hide]", selector);
      const styleEl = getStyleElement();
      return hideElements(styleEl, selector, method);
    }
    prehide(selector) {
      const styleEl = getStyleElement("autoconsent-prehide");
      this.autoconsentInstance.config.logs.lifecycle && console.log("[prehide]", styleEl, location.href);
      return hideElements(styleEl, selector, "opacity");
    }
    undoPrehide() {
      const existingElement = getStyleElement("autoconsent-prehide");
      this.autoconsentInstance.config.logs.lifecycle && console.log("[undoprehide]", existingElement, location.href);
      existingElement.remove();
    }
    async createOrUpdateStyleSheet(cssText, styleSheet) {
      if (!styleSheet) {
        styleSheet = new CSSStyleSheet();
      }
      styleSheet = await styleSheet.replace(cssText);
      return styleSheet;
    }
    removeStyleSheet(styleSheet) {
      if (styleSheet) {
        styleSheet.replace("");
        return true;
      }
      return false;
    }
    querySingleReplySelector(selector, parent = document) {
      if (selector.startsWith("aria/")) {
        return [];
      }
      if (selector.startsWith("xpath/")) {
        const xpath = selector.slice(6);
        const result = document.evaluate(xpath, parent, null, XPathResult.ANY_TYPE, null);
        let node = null;
        const elements = [];
        while (node = result.iterateNext()) {
          elements.push(node);
        }
        return elements;
      }
      if (selector.startsWith("text/")) {
        return [];
      }
      if (selector.startsWith("pierce/")) {
        return [];
      }
      if (parent.shadowRoot) {
        return Array.from(parent.shadowRoot.querySelectorAll(selector));
      }
      if (parent.contentDocument?.querySelectorAll) {
        return Array.from(parent.contentDocument.querySelectorAll(selector));
      }
      return Array.from(parent.querySelectorAll(selector));
    }
    querySelectorChain(selectors) {
      let parent = document;
      let matches2 = [];
      for (const selector of selectors) {
        matches2 = this.querySingleReplySelector(selector, parent);
        if (matches2.length === 0) {
          return [];
        }
        parent = matches2[0];
      }
      return matches2;
    }
    elementSelector(selector) {
      if (typeof selector === "string") {
        return this.querySingleReplySelector(selector);
      }
      return this.querySelectorChain(selector);
    }
    waitForMutation(selector, timeout = 6e4) {
      const node = this.elementSelector(selector);
      if (node.length === 0) {
        throw new Error(`${selector} did not match any elements`);
      }
      return new Promise((resolve, reject) => {
        const timer = setTimeout(() => {
          reject(new Error("Timed out waiting for mutation"));
          observer.disconnect();
        }, timeout);
        const observer = new MutationObserver(() => {
          clearTimeout(timer);
          observer.disconnect();
          resolve(true);
        });
        observer.observe(node[0], {
          subtree: true,
          childList: true,
          attributes: true
        });
      });
    }
  };

  // lib/encoding.ts
  var compactedRuleSteps = [
    ["exists", "e"],
    ["visible", "v"],
    ["waitForThenClick", "c"],
    ["click", "k"],
    ["waitFor", "w"],
    ["waitForVisible", "wv"],
    ["hide", "h"],
    ["cookieContains", "cc"]
  ];
  function decodeNullableBoolean(value) {
    if (value === 1) {
      return true;
    }
    if (value === 0) {
      return false;
    }
    return void 0;
  }
  function decodeRules(encoded) {
    if (encoded.v > 1) {
      throw new Error("Unsupported rule format.");
    }
    return encoded.r.filter((r) => r[0] <= SUPPORTED_RULE_STEP_VERSION).map((rule) => new CompactedCMPRule(rule, encoded.s));
  }
  var CompactedCMPRule = class {
    constructor(rule, strings) {
      this.intermediate = false;
      this.optIn = [];
      this.r = rule;
      this.s = strings;
      if (this.r[10] && this.r[10].intermediate) {
        this.intermediate = this.r[10].intermediate;
      }
    }
    _decodeRuleStep(step) {
      const clonedStep = { ...step };
      const decodeRuleStep = this._decodeRuleStep.bind(this);
      for (const [longKey, shortKey] of compactedRuleSteps) {
        if (clonedStep[shortKey] !== void 0) {
          clonedStep[longKey] = this.s[clonedStep[shortKey]];
          delete clonedStep[shortKey];
        }
      }
      if (step.if) {
        clonedStep.if = decodeRuleStep(step.if);
        clonedStep.then = step.then && step.then.map(decodeRuleStep);
        if (step.else) {
          clonedStep.else = step.else.map(decodeRuleStep);
        }
      }
      if (step.any) {
        clonedStep.any = step.any.map(decodeRuleStep);
      }
      return { ...clonedStep };
    }
    get name() {
      return this.r[1];
    }
    get cosmetic() {
      return decodeNullableBoolean(this.r[2]);
    }
    get runContext() {
      const runContext = {};
      const urlPattern = this.r[3];
      const mainFrame = this.r[4];
      const runInMainFrame = decodeNullableBoolean(Math.floor(mainFrame / 10) % 10);
      const runInSubFrame = decodeNullableBoolean(mainFrame % 10);
      if (runInMainFrame !== void 0) {
        runContext.main = runInMainFrame;
      }
      if (runInSubFrame !== void 0) {
        runContext.frame = runInSubFrame;
      }
      if (urlPattern !== "") {
        runContext.urlPattern = urlPattern;
      }
      return runContext;
    }
    get prehideSelectors() {
      return this.r[5].map((i) => this.s[i].toString());
    }
    get detectCmp() {
      return this.r[6].map(this._decodeRuleStep.bind(this));
    }
    get detectPopup() {
      return this.r[7].map(this._decodeRuleStep.bind(this));
    }
    get optOut() {
      return this.r[8].map(this._decodeRuleStep.bind(this));
    }
    get test() {
      return this.r[9].map(this._decodeRuleStep.bind(this));
    }
  };

  // lib/web.ts
  function filterCMPs(rules, config) {
    return rules.filter((cmp) => {
      return (!config.disabledCmps || !config.disabledCmps.includes(cmp.name)) && // CMP is not disabled
      (config.enableCosmeticRules || !cmp.isCosmetic) && // CMP is not cosmetic or cosmetic rules are enabled
      (config.enableGeneratedRules || !cmp.name.startsWith("auto_"));
    });
  }
  var _config;
  var AutoConsent = class {
    constructor(sendContentMessage, config = null, declarativeRules = null) {
      this.id = getRandomID();
      this.rules = [];
      __privateAdd(this, _config);
      this.state = {
        cosmeticFiltersOn: false,
        filterListReported: false,
        lifecycle: "loading",
        prehideOn: false,
        findCmpAttempts: 0,
        detectedCmps: [],
        detectedPopups: [],
        heuristicPatterns: [],
        heuristicSnippets: [],
        selfTest: null,
        clicks: 0,
        startTime: 0,
        endTime: 0
      };
      evalState.sendContentMessage = sendContentMessage;
      this.sendContentMessage = sendContentMessage;
      this.rules = [];
      this.updateState({ lifecycle: "loading" });
      this.addDynamicRules();
      if (config) {
        this.initialize(config, declarativeRules);
      } else {
        if (declarativeRules) {
          this.parseDeclarativeRules(declarativeRules);
        }
        const initMsg = {
          type: "init",
          url: window.location.href
        };
        sendContentMessage(initMsg);
        this.updateState({ lifecycle: "waitingForInitResponse" });
      }
      this.domActions = new DomActions(this);
    }
    get config() {
      if (!__privateGet(this, _config)) {
        throw new Error("AutoConsent is not initialized yet");
      }
      return __privateGet(this, _config);
    }
    initialize(config, declarativeRules) {
      const normalizedConfig = normalizeConfig(config);
      normalizedConfig.logs.lifecycle && console.log("autoconsent init", window.location.href);
      __privateSet(this, _config, normalizedConfig);
      if (!normalizedConfig.enabled) {
        normalizedConfig.logs.lifecycle && console.log("autoconsent is disabled");
        return;
      }
      if (declarativeRules) {
        this.parseDeclarativeRules(declarativeRules);
      }
      if (config.enableFilterList) {
        this.initializeFilterList();
      }
      this.rules = filterCMPs(this.rules, normalizedConfig);
      if (this.shouldPrehide) {
        if (document.documentElement) {
          this.prehideElements();
        } else {
          const delayedPrehide = () => {
            window.removeEventListener("DOMContentLoaded", delayedPrehide);
            this.prehideElements();
          };
          window.addEventListener("DOMContentLoaded", delayedPrehide);
        }
      }
      if (document.readyState === "loading") {
        const onReady = () => {
          window.removeEventListener("DOMContentLoaded", onReady);
          this.start();
        };
        window.addEventListener("DOMContentLoaded", onReady);
      } else {
        this.start();
      }
      this.updateState({ lifecycle: "initialized" });
    }
    initializeFilterList() {
    }
    get shouldPrehide() {
      return this.config.enablePrehide && !this.config.visualTest;
    }
    saveFocus() {
      this.focusedElement = document.activeElement;
      if (this.focusedElement) {
        this.config.logs.lifecycle && console.log("saving focus", this.focusedElement, location.href);
      }
    }
    restoreFocus() {
      if (this.focusedElement) {
        this.config.logs.lifecycle && console.log("restoring focus", this.focusedElement, location.href);
        try {
          this.focusedElement.focus({ preventScroll: true });
        } catch (e) {
          this.config.logs.errors && console.warn("error restoring focus", e);
        }
        this.focusedElement = void 0;
      }
    }
    addDynamicRules() {
      dynamicCMPs.forEach((Cmp) => {
        this.rules.push(new Cmp(this));
      });
    }
    parseDeclarativeRules(declarativeRules) {
      if (declarativeRules.consentomatic) {
        for (const [name, rule] of Object.entries(declarativeRules.consentomatic)) {
          this.addConsentomaticCMP(name, rule);
        }
      }
      if (declarativeRules.autoconsent) {
        declarativeRules.autoconsent.forEach((ruleset) => {
          this.addDeclarativeCMP(ruleset);
        });
      }
      if (declarativeRules.compact) {
        try {
          const rules = decodeRules(declarativeRules.compact);
          rules.forEach(this.addDeclarativeCMP.bind(this));
        } catch (e) {
          this.config.logs.errors && console.error(e);
        }
      }
    }
    addDeclarativeCMP(ruleset) {
      if ((ruleset.minimumRuleStepVersion || 1) <= SUPPORTED_RULE_STEP_VERSION) {
        this.rules.push(new AutoConsentCMP(ruleset, this));
      }
    }
    addConsentomaticCMP(name, config) {
      this.rules.push(new ConsentOMaticCMP(`com_${name}`, config));
    }
    // start the detection process, possibly with a delay
    start() {
      scheduleWhenIdle(() => this._start());
    }
    async _start() {
      const logsConfig = this.config.logs;
      logsConfig.lifecycle && console.log(`Detecting CMPs on ${window.location.href}`);
      this.updateState({ lifecycle: "started" });
      const foundCmps = await this.findCmp(this.config.detectRetries);
      this.updateState({ detectedCmps: foundCmps.map((c) => c.name) });
      if (foundCmps.length === 0) {
        logsConfig.lifecycle && console.log("no CMP found", location.href);
        if (this.shouldPrehide) {
          this.undoPrehide();
        }
        return this.filterListFallback();
      }
      this.updateState({ lifecycle: "cmpDetected" });
      const staticCmps = [];
      const cosmeticCmps = [];
      for (const cmp of foundCmps) {
        if (cmp.isCosmetic) {
          cosmeticCmps.push(cmp);
        } else {
          staticCmps.push(cmp);
        }
      }
      let result = false;
      let foundPopups = await this.detectPopups(staticCmps, async (cmp) => {
        result = await this.handlePopup(cmp);
      });
      if (foundPopups.length === 0) {
        foundPopups = await this.detectPopups(cosmeticCmps, async (cmp) => {
          result = await this.handlePopup(cmp);
        });
      }
      if (foundPopups.length === 0) {
        logsConfig.lifecycle && console.log("no popup found");
        if (this.shouldPrehide) {
          this.undoPrehide();
        }
        return false;
      }
      if (foundPopups.length > 1) {
        const errorDetails = {
          msg: `Found multiple CMPs, check the detection rules.`,
          cmps: foundPopups.map((cmp) => cmp.name)
        };
        logsConfig.errors && console.warn(errorDetails.msg, errorDetails.cmps);
        this.sendContentMessage({
          type: "autoconsentError",
          details: errorDetails
        });
      }
      return result;
    }
    async findCmp(retries) {
      const logsConfig = this.config.logs;
      this.updateState({ findCmpAttempts: this.state.findCmpAttempts + 1 });
      const foundCMPs = [];
      const isTop = isTopFrame();
      const siteSpecificRules = [];
      const genericRules = [];
      this.rules.forEach((cmp) => {
        if (cmp.checkFrameContext(isTop)) {
          const isSiteSpecific = !!cmp.runContext.urlPattern;
          if (cmp.hasMatchingUrlPattern()) {
            siteSpecificRules.push(cmp);
          } else if (!isSiteSpecific) {
            genericRules.push(cmp);
          }
        }
      });
      const heuristicRules = isTop && this.config.enableHeuristicAction ? [new AutoConsentHeuristicCMP(this)] : [];
      const rulesPriorityStages = [
        ["site-specific", siteSpecificRules],
        ["generic", genericRules],
        ["heuristic", heuristicRules]
      ];
      const runDetectCmp = async (cmp) => {
        try {
          const result = await cmp.detectCmp();
          if (result) {
            logsConfig.lifecycle && console.log(`Found CMP: ${cmp.name} ${window.location.href}`);
            this.sendContentMessage({
              type: "cmpDetected",
              url: location.href,
              cmp: cmp.name
            });
            foundCMPs.push(cmp);
          }
        } catch (e) {
          logsConfig.errors && console.warn(`error detecting ${cmp.name}`, e);
        }
      };
      const mutationObserver = this.domActions.waitForMutation("html");
      mutationObserver.catch(() => {
      });
      for (const [stageName, ruleGroup] of rulesPriorityStages) {
        logsConfig.lifecycle && ruleGroup.length > 0 && console.log(
          `Trying ${stageName} rules`,
          ruleGroup.map((r) => r.name)
        );
        await Promise.all(ruleGroup.map(runDetectCmp));
        if (foundCMPs.length > 0) {
          break;
        }
      }
      this.detectHeuristics();
      if (foundCMPs.length === 0 && retries > 0) {
        try {
          await Promise.all([this.domActions.wait(500), mutationObserver]);
        } catch (e) {
          return [];
        }
        return this.findCmp(retries - 1);
      }
      return foundCMPs;
    }
    detectHeuristics() {
      if (this.config.enableHeuristicDetection) {
        const { patterns, snippets: snippets2 } = checkHeuristicPatterns(document.documentElement?.innerText || "");
        if (patterns.length > 0 && (patterns.length !== this.state.heuristicPatterns.length || this.state.heuristicPatterns.some((p, i) => p !== patterns[i]))) {
          this.config.logs.lifecycle && console.log("Heuristic patterns found", patterns, snippets2);
          this.updateState({ heuristicPatterns: patterns, heuristicSnippets: snippets2 });
        }
      }
    }
    /**
     * Detect if a CMP has a popup open. Fullfils with the CMP if a popup is open, otherwise rejects.
     */
    async detectPopup(cmp) {
      const isOpen = await this.waitForPopup(cmp).catch((error) => {
        this.config.logs.errors && console.warn(`error waiting for a popup for ${cmp.name}`, error);
        return false;
      });
      if (isOpen) {
        this.updateState({ detectedPopups: this.state.detectedPopups.concat([cmp.name]) });
        this.sendContentMessage({
          type: "popupFound",
          cmp: cmp.name,
          url: location.href
        });
        return cmp;
      }
      throw new Error("Popup is not shown");
    }
    /**
     * Detect if any of the CMPs has a popup open. Returns a list of CMPs with open popups.
     */
    async detectPopups(cmps, onFirstPopupAppears) {
      const tasks = cmps.map((cmp) => this.detectPopup(cmp));
      await Promise.any(tasks).then((cmp) => {
        this.detectHeuristics();
        onFirstPopupAppears(cmp);
      }).catch(() => {
      });
      const results = await Promise.allSettled(tasks);
      const popups = [];
      for (const result of results) {
        if (result.status === "fulfilled") {
          popups.push(result.value);
        }
      }
      return popups;
    }
    async handlePopup(cmp) {
      this.updateState({ lifecycle: "openPopupDetected", startTime: Date.now() });
      if (this.shouldPrehide && !this.state.prehideOn) {
        this.prehideElements();
      }
      if (this.state.cosmeticFiltersOn) {
        this.undoCosmetics();
      }
      this.foundCmp = cmp;
      if (this.config.autoAction === "optOut") {
        return await this.doOptOut();
      } else if (this.config.autoAction === "optIn") {
        return await this.doOptIn();
      } else {
        this.config.logs.lifecycle && console.log("waiting for opt-out signal...", location.href);
        return true;
      }
    }
    async doOptOut() {
      const logsConfig = this.config.logs;
      this.updateState({ lifecycle: "runningOptOut" });
      this.saveFocus();
      let optOutResult;
      if (!this.foundCmp) {
        logsConfig.errors && console.log("no CMP to opt out");
        optOutResult = false;
      } else {
        logsConfig.lifecycle && console.log(`CMP ${this.foundCmp.name}: opt out on ${window.location.href}`);
        optOutResult = await this.foundCmp.optOut();
        logsConfig.lifecycle && console.log(`${this.foundCmp.name}: opt out result ${optOutResult}`);
      }
      if (this.shouldPrehide) {
        this.undoPrehide();
      }
      this.sendContentMessage({
        type: "optOutResult",
        cmp: this.foundCmp ? this.foundCmp.name : "none",
        result: optOutResult,
        scheduleSelfTest: Boolean(this.foundCmp && this.foundCmp.hasSelfTest),
        url: location.href
      });
      if (optOutResult && this.foundCmp && !this.foundCmp.isIntermediate) {
        this.state.endTime = Date.now();
        logsConfig.lifecycle && console.log(
          `${this.foundCmp.name}: done in ${this.state.endTime - this.state.startTime}ms with ${this.state.clicks} clicks`
        );
        this.sendContentMessage({
          type: "autoconsentDone",
          cmp: this.foundCmp?.name,
          isCosmetic: this.foundCmp?.isCosmetic,
          url: location.href,
          duration: this.state.endTime - this.state.startTime,
          totalClicks: this.state.clicks
        });
        this.updateState({ lifecycle: "done" });
      } else {
        this.updateState({ lifecycle: optOutResult ? "optOutSucceeded" : "optOutFailed" });
      }
      this.restoreFocus();
      return optOutResult;
    }
    async doOptIn() {
      const logsConfig = this.config.logs;
      this.updateState({ lifecycle: "runningOptIn" });
      this.saveFocus();
      let optInResult;
      if (!this.foundCmp) {
        logsConfig.errors && console.log("no CMP to opt in");
        optInResult = false;
      } else {
        logsConfig.lifecycle && console.log(`CMP ${this.foundCmp.name}: opt in on ${window.location.href}`);
        optInResult = await this.foundCmp.optIn();
        logsConfig.lifecycle && console.log(`${this.foundCmp.name}: opt in result ${optInResult}`);
      }
      if (this.shouldPrehide) {
        this.undoPrehide();
      }
      this.sendContentMessage({
        type: "optInResult",
        cmp: this.foundCmp ? this.foundCmp.name : "none",
        result: optInResult,
        scheduleSelfTest: false,
        // self-tests are only for opt-out at the moment
        url: location.href
      });
      if (optInResult && this.foundCmp && !this.foundCmp.isIntermediate) {
        this.state.endTime = Date.now();
        logsConfig.lifecycle && console.log(
          `${this.foundCmp.name}: done in ${this.state.endTime - this.state.startTime}ms with ${this.state.clicks} clicks`
        );
        this.sendContentMessage({
          type: "autoconsentDone",
          cmp: this.foundCmp.name,
          isCosmetic: this.foundCmp.isCosmetic,
          url: location.href,
          duration: this.state.endTime - this.state.startTime,
          totalClicks: this.state.clicks
        });
        this.updateState({ lifecycle: "done" });
      } else {
        this.updateState({ lifecycle: optInResult ? "optInSucceeded" : "optInFailed" });
      }
      this.restoreFocus();
      return optInResult;
    }
    async doSelfTest() {
      const logsConfig = this.config.logs;
      let selfTestResult;
      if (!this.foundCmp) {
        logsConfig.errors && console.log("no CMP to self test");
        selfTestResult = false;
      } else {
        logsConfig.lifecycle && console.log(`CMP ${this.foundCmp.name}: self-test on ${window.location.href}`);
        selfTestResult = await this.foundCmp.test();
      }
      this.sendContentMessage({
        type: "selfTestResult",
        cmp: this.foundCmp ? this.foundCmp.name : "none",
        result: selfTestResult,
        url: location.href
      });
      this.updateState({ selfTest: selfTestResult });
      return selfTestResult;
    }
    // TODO: use MutationObserver like in findCmp()
    async waitForPopup(cmp, retries = 10, interval = 500) {
      const logsConfig = this.config.logs;
      logsConfig.lifecycle && console.log("checking if popup is open...", cmp.name);
      const isOpen = await cmp.detectPopup().catch((e) => {
        logsConfig.errors && console.warn(`error detecting popup for ${cmp.name}`, e);
        return false;
      });
      if (!isOpen && retries > 0) {
        await this.domActions.wait(interval);
        return this.waitForPopup(cmp, retries - 1, interval);
      }
      logsConfig.lifecycle && console.log(cmp.name, `popup is ${isOpen ? "open" : "not open"}`);
      return isOpen;
    }
    prehideElements() {
      const logsConfig = this.config.logs;
      const globalHidden = [
        "#didomi-popup,.didomi-popup-container,.didomi-popup-notice,.didomi-consent-popup-preferences,#didomi-notice,.didomi-popup-backdrop,.didomi-screen-medium"
      ];
      const selectors = this.rules.filter((rule) => rule.prehideSelectors && rule.checkRunContext()).reduce((selectorList, rule) => [...selectorList || [], ...rule.prehideSelectors || []], globalHidden);
      this.updateState({ prehideOn: true });
      setTimeout(() => {
        if (this.shouldPrehide && this.state.prehideOn && !["runningOptOut", "runningOptIn"].includes(this.state.lifecycle)) {
          logsConfig.lifecycle && console.log("Process is taking too long, unhiding elements");
          this.undoPrehide();
        }
      }, this.config.prehideTimeout || 2e3);
      return this.domActions.prehide(selectors.join(","));
    }
    undoPrehide() {
      this.updateState({ prehideOn: false });
      this.domActions.undoPrehide();
    }
    undoCosmetics() {
    }
    reportFilterlist() {
      this.sendContentMessage({
        type: "cmpDetected",
        url: location.href,
        cmp: "filterList"
      });
      this.sendContentMessage({
        type: "popupFound",
        cmp: "filterList",
        url: location.href
      });
      this.updateState({ filterListReported: true });
    }
    filterListFallback() {
      this.updateState({ lifecycle: "nothingDetected" });
      return false;
    }
    updateState(change) {
      Object.assign(this.state, change);
      this.sendContentMessage({
        type: "report",
        instanceId: this.id,
        url: window.location.href,
        mainFrame: isTopFrame(),
        state: this.state
      });
    }
    async receiveMessageCallback(message) {
      const logsConfig = __privateGet(this, _config)?.logs;
      if (logsConfig?.messages) {
        console.log("received from background", message, window.location.href);
      }
      switch (message.type) {
        case "initResp":
          this.initialize(message.config, message.rules);
          break;
        case "optIn":
          await this.doOptIn();
          break;
        case "optOut":
          await this.doOptOut();
          break;
        case "selfTest":
          await this.doSelfTest();
          break;
        case "evalResp":
          resolveEval(message.id, message.result);
          break;
      }
    }
  };
  _config = new WeakMap();

  // rules/consentomatic.json
  var consentomatic = { "didomi.io": { detectors: [{ presentMatcher: { target: { selector: "#didomi-host, #didomi-notice" }, type: "css" }, showingMatcher: { target: { selector: "body.didomi-popup-open, .didomi-notice-banner" }, type: "css" } }], methods: [{ action: { target: { selector: ".didomi-popup-notice-buttons .didomi-button:not(.didomi-button-highlight), .didomi-notice-banner .didomi-learn-more-button" }, type: "click" }, name: "OPEN_OPTIONS" }, { action: { actions: [{ retries: 50, target: { selector: "#didomi-purpose-cookies" }, type: "waitcss", waitTime: 50 }, { consents: [{ description: "Share (everything) with others", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-share_whith_others]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-share_whith_others]:last-child" }, type: "click" }, type: "X" }, { description: "Information storage and access", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-cookies]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-cookies]:last-child" }, type: "click" }, type: "D" }, { description: "Content selection, offers and marketing", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-CL-T1Rgm7]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-CL-T1Rgm7]:last-child" }, type: "click" }, type: "E" }, { description: "Analytics", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-analytics]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-analytics]:last-child" }, type: "click" }, type: "B" }, { description: "Analytics", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-M9NRHJe3G]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-M9NRHJe3G]:last-child" }, type: "click" }, type: "B" }, { description: "Ad and content selection", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-advertising_personalization]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-advertising_personalization]:last-child" }, type: "click" }, type: "F" }, { description: "Ad and content selection", falseAction: { parent: { childFilter: { target: { selector: "#didomi-purpose-pub-ciblee" } }, selector: ".didomi-consent-popup-data-processing, .didomi-components-accordion-label-container" }, target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-pub-ciblee]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-pub-ciblee]:last-child" }, type: "click" }, type: "F" }, { description: "Ad and content selection - basics", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-q4zlJqdcD]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-q4zlJqdcD]:last-child" }, type: "click" }, type: "F" }, { description: "Ad and content selection - partners and subsidiaries", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-partenaire-cAsDe8jC]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-partenaire-cAsDe8jC]:last-child" }, type: "click" }, type: "F" }, { description: "Ad and content selection - social networks", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-p4em9a8m]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-p4em9a8m]:last-child" }, type: "click" }, type: "F" }, { description: "Ad and content selection - others", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-autres-pub]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-autres-pub]:last-child" }, type: "click" }, type: "F" }, { description: "Social networks", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-reseauxsociaux]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-reseauxsociaux]:last-child" }, type: "click" }, type: "A" }, { description: "Social networks", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-social_media]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-social_media]:last-child" }, type: "click" }, type: "A" }, { description: "Content selection", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-content_personalization]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-content_personalization]:last-child" }, type: "click" }, type: "E" }, { description: "Ad delivery", falseAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-ad_delivery]:first-child" }, type: "click" }, trueAction: { target: { selector: ".didomi-components-radio__option[aria-describedby=didomi-purpose-ad_delivery]:last-child" }, type: "click" }, type: "F" }], type: "consent" }, { action: { consents: [{ matcher: { childFilter: { target: { selector: ":not(.didomi-components-radio__option--selected)" } }, type: "css" }, trueAction: { target: { selector: ":nth-child(2)" }, type: "click" }, falseAction: { target: { selector: ":first-child" }, type: "click" }, type: "X" }], type: "consent" }, target: { selector: ".didomi-components-radio" }, type: "foreach" }], type: "list" }, name: "DO_CONSENT" }, { action: { parent: { selector: ".didomi-consent-popup-footer .didomi-consent-popup-actions" }, target: { selector: ".didomi-components-button:first-child" }, type: "click" }, name: "SAVE_CONSENT" }] }, oil: { detectors: [{ presentMatcher: { target: { selector: ".as-oil-content-overlay" }, type: "css" }, showingMatcher: { target: { selector: ".as-oil-content-overlay" }, type: "css" } }], methods: [{ action: { actions: [{ target: { selector: ".as-js-advanced-settings" }, type: "click" }, { retries: "10", target: { selector: ".as-oil-cpc__purpose-container" }, type: "waitcss", waitTime: "250" }], type: "list" }, name: "OPEN_OPTIONS" }, { action: { actions: [{ consents: [{ matcher: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Information storage and access", "Opbevaring af og adgang til oplysninger p\xE5 din enhed"] }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Information storage and access", "Opbevaring af og adgang til oplysninger p\xE5 din enhed"] }, target: { selector: ".as-oil-cpc__switch" }, type: "click" }, type: "D" }, { matcher: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Personlige annoncer", "Personalisation"] }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Personlige annoncer", "Personalisation"] }, target: { selector: ".as-oil-cpc__switch" }, type: "click" }, type: "E" }, { matcher: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Annoncevalg, levering og rapportering", "Ad selection, delivery, reporting"] }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Annoncevalg, levering og rapportering", "Ad selection, delivery, reporting"] }, target: { selector: ".as-oil-cpc__switch" }, type: "click" }, type: "F" }, { matcher: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Personalisering af indhold", "Content selection, delivery, reporting"] }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: ["Personalisering af indhold", "Content selection, delivery, reporting"] }, target: { selector: ".as-oil-cpc__switch" }, type: "click" }, type: "E" }, { matcher: { parent: { childFilter: { target: { selector: ".as-oil-cpc__purpose-header", textFilter: ["M\xE5ling", "Measurement"] } }, selector: ".as-oil-cpc__purpose-container" }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { childFilter: { target: { selector: ".as-oil-cpc__purpose-header", textFilter: ["M\xE5ling", "Measurement"] } }, selector: ".as-oil-cpc__purpose-container" }, target: { selector: ".as-oil-cpc__switch" }, type: "click" }, type: "B" }, { matcher: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: "Google" }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { selector: ".as-oil-cpc__purpose-container", textFilter: "Google" }, target: { selector: ".as-oil-cpc__switch" }, type: "click" }, type: "F" }], type: "consent" }], type: "list" }, name: "DO_CONSENT" }, { action: { target: { selector: ".as-oil__btn-optin" }, type: "click" }, name: "SAVE_CONSENT" }, { action: { target: { selector: "div.as-oil" }, type: "hide" }, name: "HIDE_CMP" }] }, optanon: { detectors: [{ presentMatcher: { target: { selector: "#optanon-menu, .optanon-alert-box-wrapper" }, type: "css" }, showingMatcher: { target: { displayFilter: true, selector: ".optanon-alert-box-wrapper" }, type: "css" } }], methods: [{ action: { actions: [{ target: { selector: ".optanon-alert-box-wrapper .optanon-toggle-display, a[onclick*='OneTrust.ToggleInfoDisplay()'], a[onclick*='Optanon.ToggleInfoDisplay()']" }, type: "click" }], type: "list" }, name: "OPEN_OPTIONS" }, { action: { actions: [{ target: { selector: ".preference-menu-item #Your-privacy" }, type: "click" }, { target: { selector: "#optanon-vendor-consent-text" }, type: "click" }, { action: { consents: [{ matcher: { target: { selector: "input" }, type: "checkbox" }, toggleAction: { target: { selector: "label" }, type: "click" }, type: "X" }], type: "consent" }, target: { selector: "#optanon-vendor-consent-list .vendor-item" }, type: "foreach" }, { target: { selector: ".vendor-consent-back-link" }, type: "click" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-performance" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-performance" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "B" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-functional" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-functional" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "E" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-advertising" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-advertising" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "F" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-social" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-social" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "B" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Social Media Cookies" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Social Media Cookies" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "B" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Personalisation" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Personalisation" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "E" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Site monitoring cookies" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Site monitoring cookies" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "B" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Third party privacy-enhanced content" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Third party privacy-enhanced content" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "X" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Performance & Advertising Cookies" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Performance & Advertising Cookies" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "F" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Information storage and access" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Information storage and access" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "D" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Ad selection, delivery, reporting" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Ad selection, delivery, reporting" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "F" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Content selection, delivery, reporting" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Content selection, delivery, reporting" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "E" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Measurement" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Measurement" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "B" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Recommended Cookies" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Recommended Cookies" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "X" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Unclassified Cookies" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Unclassified Cookies" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "X" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Analytical Cookies" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Analytical Cookies" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "B" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Marketing Cookies" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Marketing Cookies" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "F" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Personalization" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Personalization" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "E" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Ad Selection, Delivery & Reporting" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Ad Selection, Delivery & Reporting" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "F" }], type: "consent" }], type: "list" }, type: "ifcss" }, { parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Content Selection, Delivery & Reporting" }, trueAction: { actions: [{ parent: { selector: "#optanon-menu, .optanon-menu" }, target: { selector: ".menu-item-necessary", textFilter: "Content Selection, Delivery & Reporting" }, type: "click" }, { consents: [{ matcher: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status input" }, type: "checkbox" }, toggleAction: { parent: { selector: "#optanon-popup-body-right" }, target: { selector: ".optanon-status label" }, type: "click" }, type: "E" }], type: "consent" }], type: "list" }, type: "ifcss" }], type: "list" }, name: "DO_CONSENT" }, { action: { parent: { selector: ".optanon-save-settings-button" }, target: { selector: ".optanon-white-button-middle" }, type: "click" }, name: "SAVE_CONSENT" }, { action: { actions: [{ target: { selector: "#optanon-popup-wrapper" }, type: "hide" }, { target: { selector: "#optanon-popup-bg" }, type: "hide" }, { target: { selector: ".optanon-alert-box-wrapper" }, type: "hide" }], type: "list" }, name: "HIDE_CMP" }] }, quantcast2: { detectors: [{ presentMatcher: { target: { selector: "[data-tracking-opt-in-overlay]" }, type: "css" }, showingMatcher: { target: { selector: "[data-tracking-opt-in-overlay] [data-tracking-opt-in-learn-more]" }, type: "css" } }], methods: [{ action: { target: { selector: "[data-tracking-opt-in-overlay] [data-tracking-opt-in-learn-more]" }, type: "click" }, name: "OPEN_OPTIONS" }, { action: { actions: [{ type: "wait", waitTime: 500 }, { action: { actions: [{ target: { selector: "div", textFilter: ["Information storage and access"] }, trueAction: { consents: [{ matcher: { target: { selector: "input" }, type: "checkbox" }, toggleAction: { target: { selector: "label" }, type: "click" }, type: "D" }], type: "consent" }, type: "ifcss" }, { target: { selector: "div", textFilter: ["Personalization"] }, trueAction: { consents: [{ matcher: { target: { selector: "input" }, type: "checkbox" }, toggleAction: { target: { selector: "label" }, type: "click" }, type: "F" }], type: "consent" }, type: "ifcss" }, { target: { selector: "div", textFilter: ["Ad selection, delivery, reporting"] }, trueAction: { consents: [{ matcher: { target: { selector: "input" }, type: "checkbox" }, toggleAction: { target: { selector: "label" }, type: "click" }, type: "F" }], type: "consent" }, type: "ifcss" }, { target: { selector: "div", textFilter: ["Content selection, delivery, reporting"] }, trueAction: { consents: [{ matcher: { target: { selector: "input" }, type: "checkbox" }, toggleAction: { target: { selector: "label" }, type: "click" }, type: "E" }], type: "consent" }, type: "ifcss" }, { target: { selector: "div", textFilter: ["Measurement"] }, trueAction: { consents: [{ matcher: { target: { selector: "input" }, type: "checkbox" }, toggleAction: { target: { selector: "label" }, type: "click" }, type: "B" }], type: "consent" }, type: "ifcss" }, { target: { selector: "div", textFilter: ["Other Partners"] }, trueAction: { consents: [{ matcher: { target: { selector: "input" }, type: "checkbox" }, toggleAction: { target: { selector: "label" }, type: "click" }, type: "X" }], type: "consent" }, type: "ifcss" }], type: "list" }, parent: { childFilter: { target: { selector: "input" } }, selector: "[data-tracking-opt-in-overlay] > div > div" }, target: { childFilter: { target: { selector: "input" } }, selector: ":scope > div" }, type: "foreach" }], type: "list" }, name: "DO_CONSENT" }, { action: { target: { selector: "[data-tracking-opt-in-overlay] [data-tracking-opt-in-save]" }, type: "click" }, name: "SAVE_CONSENT" }] }, springer: { detectors: [{ presentMatcher: { parent: null, target: { selector: ".cmp-app_gdpr" }, type: "css" }, showingMatcher: { parent: null, target: { displayFilter: true, selector: ".cmp-popup_popup" }, type: "css" } }], methods: [{ action: { actions: [{ target: { selector: ".cmp-intro_rejectAll" }, type: "click" }, { type: "wait", waitTime: 250 }, { target: { selector: ".cmp-purposes_purposeItem:not(.cmp-purposes_selectedPurpose)" }, type: "click" }], type: "list" }, name: "OPEN_OPTIONS" }, { action: { consents: [{ matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Przechowywanie informacji na urz\u0105dzeniu lub dost\u0119p do nich", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Przechowywanie informacji na urz\u0105dzeniu lub dost\u0119p do nich", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "D" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Wyb\xF3r podstawowych reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Wyb\xF3r podstawowych reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "F" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Tworzenie profilu spersonalizowanych reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Tworzenie profilu spersonalizowanych reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "F" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Wyb\xF3r spersonalizowanych reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Wyb\xF3r spersonalizowanych reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "E" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Tworzenie profilu spersonalizowanych tre\u015Bci", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Tworzenie profilu spersonalizowanych tre\u015Bci", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "E" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Wyb\xF3r spersonalizowanych tre\u015Bci", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Wyb\xF3r spersonalizowanych tre\u015Bci", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "B" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Pomiar wydajno\u015Bci reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Pomiar wydajno\u015Bci reklam", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "B" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Pomiar wydajno\u015Bci tre\u015Bci", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Pomiar wydajno\u015Bci tre\u015Bci", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "B" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Stosowanie bada\u0144 rynkowych w celu generowania opinii odbiorc\xF3w", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Stosowanie bada\u0144 rynkowych w celu generowania opinii odbiorc\xF3w", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "X" }, { matcher: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Opracowywanie i ulepszanie produkt\xF3w", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch .cmp-switch_isSelected" }, type: "css" }, toggleAction: { parent: { selector: ".cmp-purposes_detailHeader", textFilter: "Opracowywanie i ulepszanie produkt\xF3w", childFilter: { target: { selector: ".cmp-switch_switch" } } }, target: { selector: ".cmp-switch_switch:not(.cmp-switch_isSelected)" }, type: "click" }, type: "X" }], type: "consent" }, name: "DO_CONSENT" }, { action: { target: { selector: ".cmp-details_save" }, type: "click" }, name: "SAVE_CONSENT" }] }, wordpressgdpr: { detectors: [{ presentMatcher: { parent: null, target: { selector: ".wpgdprc-consent-bar" }, type: "css" }, showingMatcher: { parent: null, target: { displayFilter: true, selector: ".wpgdprc-consent-bar" }, type: "css" } }], methods: [{ action: { parent: null, target: { selector: ".wpgdprc-consent-bar .wpgdprc-consent-bar__settings", textFilter: null }, type: "click" }, name: "OPEN_OPTIONS" }, { action: { actions: [{ target: { selector: ".wpgdprc-consent-modal .wpgdprc-button", textFilter: "Eyeota" }, type: "click" }, { consents: [{ description: "Eyeota Cookies", matcher: { parent: { selector: ".wpgdprc-consent-modal__description", textFilter: "Eyeota" }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { selector: ".wpgdprc-consent-modal__description", textFilter: "Eyeota" }, target: { selector: "label" }, type: "click" }, type: "X" }], type: "consent" }, { target: { selector: ".wpgdprc-consent-modal .wpgdprc-button", textFilter: "Advertising" }, type: "click" }, { consents: [{ description: "Advertising Cookies", matcher: { parent: { selector: ".wpgdprc-consent-modal__description", textFilter: "Advertising" }, target: { selector: "input" }, type: "checkbox" }, toggleAction: { parent: { selector: ".wpgdprc-consent-modal__description", textFilter: "Advertising" }, target: { selector: "label" }, type: "click" }, type: "F" }], type: "consent" }], type: "list" }, name: "DO_CONSENT" }, { action: { parent: null, target: { selector: ".wpgdprc-button", textFilter: "Save my settings" }, type: "click" }, name: "SAVE_CONSENT" }] } };

  // playwright/content.ts
  if (!window.autoconsentReceiveMessage) {
    const consent = new AutoConsent(window.autoconsentSendMessage, null, { autoconsent: [], consentomatic });
    window.autoconsentReceiveMessage = (message) => {
      return Promise.resolve(consent.receiveMessageCallback(message));
    };
  } else {
    console.warn("autoconsent already initialized", window.autoconsentReceiveMessage);
  }
})();
