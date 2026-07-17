import { calendarAccountRegistry } from '../CalendarAccountRegistry';

const JESSICA_ID = '11111111-1111-1111-1111-111111111111';
const JAZMIN_ID = '22222222-2222-2222-2222-222222222222';

function setAccounts(json: string | undefined) {
  if (json === undefined) {
    delete process.env.GOOGLE_CALENDAR_ACCOUNTS;
  } else {
    process.env.GOOGLE_CALENDAR_ACCOUNTS = json;
  }
  calendarAccountRegistry.reset();
}

describe('CalendarAccountRegistry', () => {
  const OLD_ENV = { ...process.env };

  beforeEach(() => {
    process.env = { ...OLD_ENV };
    delete process.env.GOOGLE_CALENDAR_ACCOUNTS;
    delete process.env.GOOGLE_IMPERSONATE_USER;
    delete process.env.GOOGLE_CALENDAR_ID;
    delete process.env.STRICT_CALENDAR_ACCOUNTS;
    calendarAccountRegistry.reset();
  });

  afterAll(() => {
    process.env = OLD_ENV;
    calendarAccountRegistry.reset();
  });

  it('resuelve la cuenta de Jessica por consultor_id', () => {
    setAccounts(
      JSON.stringify([
        {
          key: 'jessica',
          impersonateUser: 'jessica.tapia@diegodiaz.mx',
          calendarId: 'primary',
          consultorIds: [JESSICA_ID],
        },
        {
          key: 'jazmin',
          impersonateUser: 'fiscalista@diegodiaz.mx',
          calendarId: 'primary',
          consultorIds: [JAZMIN_ID],
        },
      ])
    );

    const acc = calendarAccountRegistry.resolveForConsultor(JESSICA_ID);
    expect(acc).not.toBeNull();
    expect(acc!.key).toBe('jessica');
    expect(acc!.impersonateUser).toBe('jessica.tapia@diegodiaz.mx');
  });

  it('resuelve la cuenta de Jazmin por consultor_id', () => {
    setAccounts(
      JSON.stringify([
        { key: 'jessica', impersonateUser: 'a@x.mx', calendarId: 'primary', consultorIds: [JESSICA_ID] },
        { key: 'jazmin', impersonateUser: 'fiscalista@diegodiaz.mx', calendarId: 'primary', consultorIds: [JAZMIN_ID] },
      ])
    );
    const acc = calendarAccountRegistry.resolveForConsultor(JAZMIN_ID);
    expect(acc!.key).toBe('jazmin');
  });

  it('devuelve null en modo STRICT si el consultor no está mapeado', () => {
    process.env.STRICT_CALENDAR_ACCOUNTS = 'true';
    setAccounts(
      JSON.stringify([
        { key: 'jessica', impersonateUser: 'a@x.mx', calendarId: 'primary', consultorIds: [JESSICA_ID] },
      ])
    );
    expect(calendarAccountRegistry.resolveForConsultor('unknown-id')).toBeNull();
  });

  it('usa la cuenta legacy como fallback cuando NO está en STRICT', () => {
    process.env.GOOGLE_IMPERSONATE_USER = 'legacy@x.mx';
    process.env.GOOGLE_CALENDAR_ID = 'primary';
    setAccounts(undefined);

    const acc = calendarAccountRegistry.resolveForConsultor('unknown-id');
    expect(acc).not.toBeNull();
    expect(acc!.legacy).toBe(true);
    expect(acc!.impersonateUser).toBe('legacy@x.mx');
  });

  it('lanza error si dos cuentas comparten un consultor_id', () => {
    setAccounts(
      JSON.stringify([
        { key: 'a', impersonateUser: 'a@x.mx', calendarId: 'primary', consultorIds: [JESSICA_ID] },
        { key: 'b', impersonateUser: 'b@x.mx', calendarId: 'primary', consultorIds: [JESSICA_ID] },
      ])
    );
    expect(() => calendarAccountRegistry.list()).toThrow(/dos cuentas/i);
  });

  it('lanza error si dos cuentas tienen la misma key', () => {
    setAccounts(
      JSON.stringify([
        { key: 'dup', impersonateUser: 'a@x.mx', calendarId: 'primary', consultorIds: [] },
        { key: 'dup', impersonateUser: 'b@x.mx', calendarId: 'primary', consultorIds: [] },
      ])
    );
    expect(() => calendarAccountRegistry.list()).toThrow(/duplicada/i);
  });

  it('getByKey encuentra la cuenta y es case-insensitive', () => {
    setAccounts(
      JSON.stringify([
        { key: 'Jessica', impersonateUser: 'a@x.mx', calendarId: 'primary', consultorIds: [] },
      ])
    );
    expect(calendarAccountRegistry.getByKey('jessica')!.impersonateUser).toBe('a@x.mx');
    expect(calendarAccountRegistry.getByKey('unknown')).toBeNull();
  });
});
