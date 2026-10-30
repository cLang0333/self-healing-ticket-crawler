import type { SelectorCandidate } from '../src/locators';

/**
 * 华信航空（Mandarin Airlines）国内线查票选择器。
 *
 * 以后的 AI 自动修复只允许改这个文件。解码、只读护栏、日期和测试流程不要写进这里。
 * 每个元素按顺序给出多组定位（id、文字 / role、结构）。运行时采用第一个「恰好一个匹配」的，其余是备份。
 *
 * 只读：buyAvailable / buyWaitlist 只用来读取按钮文字（我要購票 / 我要候補），测试不得点击。
 */

export const mandarinSelectors = {
  home: {
    departure: [
      '#depstn',
      'form#book select[name="depstn"]',
      'form#book label:has-text("出發地") select',
      {
        name: 'label=出發地',
        locate: (scope) => scope.getByLabel(/出發地/),
      },
    ] satisfies SelectorCandidate[],

    /**
     * 选完出发地后，页面会跑 ChooseArrAirport()，清掉并重建 #arrstn。
     * 必须先选出发地，再等目的地选项出现。飞金门时选项来自 #arrivalCityOrg 里 class 含出发地代码的 option。
     */
    arrival: [
      '#arrstn',
      'form#book select[name="arrstn"]',
      'form#book label:has-text("目的地") select',
      {
        name: 'label=目的地',
        locate: (scope) => scope.getByLabel(/目的地/),
      },
    ] satisfies SelectorCandidate[],

    /** #itinType1 默认选中，但 input 是 display:none，role 备份要包含隐藏元素。 */
    oneWay: [
      '#itinType1',
      'form#book input[name="itinType"][value="oneway"]',
      'form#book label[for="itinType1"] input',
      {
        name: 'role=radio name=/單\\s*程/ includeHidden',
        locate: (scope) => scope.getByRole('radio', { name: /單\s*程/, includeHidden: true }),
      },
    ] satisfies SelectorCandidate[],

    /**
     * 页面上有两个 name=departureDate。
     * 单程用 #datepicker1 里的这个；#home_departureDate 是来回程，不要匹配到它。
     */
    departureDate: [
      '#datepicker1 input[name="departureDate"]',
      '#oneday input[name="departureDate"]',
      'form#book #datepicker1 input[placeholder="出發日"]',
      {
        name: '#datepicker1 placeholder=出發日',
        locate: (scope) => scope.locator('#datepicker1').getByPlaceholder('出發日'),
      },
    ] satisfies SelectorCandidate[],

    adult: [
      'form#book select[name="adult"]',
      'form#book select.adult',
      'form#book label:has-text("旅") select',
      {
        name: 'label=/旅\\s*客/',
        locate: (scope) => scope.locator('form#book').getByLabel(/旅\s*客/),
      },
    ] satisfies SelectorCandidate[],

    /** 婴儿人数的字段名是 child，不是 infant。默认 0。 */
    infant: [
      'form#book select[name="child"]',
      'form#book select.kids',
      'form#book label:has-text("嬰") select',
      {
        name: 'label=/嬰\\s*兒/',
        locate: (scope) => scope.locator('form#book').getByLabel(/嬰\s*兒/),
      },
    ] satisfies SelectorCandidate[],

    /**
     * 只点订票表单里的搜索。onclick 是 beforeSub()：先取隐形 reCAPTCHA v3 token，再提交。
     * 同页「行程管理」里还有一颗「搜 尋」（doPnrSubmit），不在 form#book 内，不能点到它。
     */
    searchButton: [
      'form#book button.btn-primary',
      'form#book button[onclick*="beforeSub"]',
      'form#book button:has-text("搜 尋")',
      {
        name: 'form#book role=button name=/搜\\s*尋/',
        locate: (scope) => scope.locator('form#book').getByRole('button', { name: /搜\s*尋/ }),
      },
    ] satisfies SelectorCandidate[],

    /** 不挡操作。可见时可以点掉，避免挡住截图；这不是购票动作。 */
    cookieAccept: [
      '#AcceptCookiePolicyButton',
      'button:has-text("我同意")',
      {
        name: 'role=button name=我同意',
        locate: (scope) => scope.getByRole('button', { name: '我同意' }),
      },
    ] satisfies SelectorCandidate[],
  },

  result: {
    ticketBox: [
      '.ticket-list .ticket-box',
      'div.ticket-box',
      {
        name: '.ticket-list >> .ticket-box',
        locate: (scope) => scope.locator('.ticket-list').locator('.ticket-box'),
      },
    ] satisfies SelectorCandidate[],

    flightNumber: ['.air-type p', '.air-type', 'div.air-type p'] satisfies SelectorCandidate[],

    departureTime: [
      '.flight-time p:has-text("起飛")',
      '.flight-time:has-text("起飛")',
      'p:has-text("起飛")',
    ] satisfies SelectorCandidate[],

    arrivalTime: [
      '.flight-time p:has-text("抵達")',
      '.flight-time:has-text("抵達")',
      'p:has-text("抵達")',
    ] satisfies SelectorCandidate[],

    /**
     * 有价格时是 <div class="price2"><p>$<span>2,288</span>起</p></div>。
     * 没有价格时是 <div class="price2"><p>--</p></div>，里面没有 span。先读整块，再退到 p / span。
     */
    pricePromo: ['.price2', '.price2 p', '.price2 span'] satisfies SelectorCandidate[],
    priceResident: ['.price3', '.price3 p', '.price3 span'] satisfies SelectorCandidate[],

    /** 可售。只读文字，禁止点击。 */
    buyAvailable: [
      '.buybt',
      '.buybt:has-text("我要購票")',
      'div.buybt p',
    ] satisfies SelectorCandidate[],

    /** 候补。只读文字，禁止点击。 */
    buyWaitlist: [
      '.buybt01',
      '.buybt01:has-text("我要候補")',
      'div.buybt01 p',
    ] satisfies SelectorCandidate[],

    /**
     * FlightJsonStr 在 form#form2 和 form#Waittingform 各有一份，id 重复。
     * 裸 #FlightJsonStr 会匹配到两个，解析时会跳过。必须限定在 form#form2。
     */
    flightJson: [
      'form#form2 input[name="FlightJsonStr"]',
      'form[name="form2"] input[name="FlightJsonStr"]',
      '#form2 input#FlightJsonStr',
    ] satisfies SelectorCandidate[],

    fareJson: [
      'form#form2 input[name="FareJsonStr"]',
      'form[name="form2"] input[name="FareJsonStr"]',
      '#form2 input#FareJsonStr',
    ] satisfies SelectorCandidate[],

    routeSummary: ['.flight-inf2', '.flight-inf22'] satisfies SelectorCandidate[],
  },
};

/** 目的地选项。code 只能是三个大写字母，避免把任意字符串拼进选择器。 */
export function arrivalOptionCandidates(code: string): SelectorCandidate[] {
  if (!/^[A-Z]{3}$/.test(code)) throw new Error(`机场代码不合法：${code}`);
  return [`option[value="${code}"]`, `option:has-text("(${code})")`];
}
