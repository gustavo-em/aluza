import { resolveDeviceLanguage } from '../src/app/infrastructure/locale/deviceLanguage';

describe('device language', () => {
  it('speaks Portuguese to a phone set to Portuguese, however the tag is spelt', () => {
    expect(resolveDeviceLanguage(['pt-BR'])).toBe('pt-BR');
    expect(resolveDeviceLanguage(['pt_BR'])).toBe('pt-BR');
    expect(resolveDeviceLanguage(['pt-PT'])).toBe('pt-BR');
    expect(resolveDeviceLanguage(['pt'])).toBe('pt-BR');
  });

  it('speaks English to every other phone', () => {
    expect(resolveDeviceLanguage(['en-GB'])).toBe('en-US');
    expect(resolveDeviceLanguage(['vi-VN'])).toBe('en-US');
    expect(resolveDeviceLanguage(['ru_RU'])).toBe('en-US');
    expect(resolveDeviceLanguage(['pl-PL', 'de-DE'])).toBe('en-US');
  });

  it('speaks English to a phone that will not say', () => {
    expect(resolveDeviceLanguage([])).toBe('en-US');
  });

  it('honours the order the phone lists its languages in', () => {
    expect(resolveDeviceLanguage(['vi-VN', 'en-US', 'pt-BR'])).toBe('en-US');
    expect(resolveDeviceLanguage(['de-DE', 'pt-BR', 'en-US'])).toBe('pt-BR');
  });
});
