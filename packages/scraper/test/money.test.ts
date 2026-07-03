import { describe, expect, it } from 'vitest'
import { MoneyParseError, usdCentsToInt, weiUsdtToCents } from '../src/parsers/money'

describe('weiUsdtToCents', () => {
  it('converts live-verified values exactly', () => {
    expect(weiUsdtToCents('48000000000000000000')).toBe(4800) // OMEGA $48
    expect(weiUsdtToCents('88000000000000000000')).toBe(8800) // RenaCrypt $88
    expect(weiUsdtToCents('150000000000000000000')).toBe(15000) // Eden $150
    expect(weiUsdtToCents('100000000000000000000')).toBe(10000) // limited packs $100
    expect(weiUsdtToCents('52020000000000000000')).toBe(5202) // marketplace ask $52.02
  })

  it('rounds sub-cent values half-up (they exist live)', () => {
    expect(weiUsdtToCents('999999993000000000000000')).toBe(99_999_999) // $999,999.993 → …99 cents? no: .993 → 99, i.e. 99999999.3 cents → 99999999
    expect(weiUsdtToCents('5000000000000000')).toBe(1) // exactly half a cent → up
    expect(weiUsdtToCents('4999999999999999')).toBe(0) // just below half a cent → down
    expect(weiUsdtToCents('15000000000000000')).toBe(2) // 1.5 cents → 2
  })

  it('handles zero and tiny values', () => {
    expect(weiUsdtToCents('0')).toBe(0)
    expect(weiUsdtToCents('1')).toBe(0)
  })

  it('rejects malformed input', () => {
    for (const bad of ['', '-1', '1.5', 'NO-ASK-PRICE', '1e18', ' 48', '48 ']) {
      expect(() => weiUsdtToCents(bad)).toThrow(MoneyParseError)
    }
  })

  it('rejects values overflowing safe integer cents', () => {
    expect(() => weiUsdtToCents(`${'9'.repeat(40)}`)).toThrow(MoneyParseError)
  })
})

describe('usdCentsToInt', () => {
  it('converts live-verified values exactly', () => {
    expect(usdCentsToInt('5184')).toBe(5184) // OMEGA claimed EV $51.84
    expect(usdCentsToInt('153200')).toBe(153200) // OMEGA featured card $1,532
    expect(usdCentsToInt('443400')).toBe(443400) // Eden featured card $4,434
    expect(usdCentsToInt('0')).toBe(0)
  })

  it('rejects malformed input', () => {
    for (const bad of ['', '-5', '51.84', 'NO-FMV-PRICE', '$5184']) {
      expect(() => usdCentsToInt(bad)).toThrow(MoneyParseError)
    }
  })
})
