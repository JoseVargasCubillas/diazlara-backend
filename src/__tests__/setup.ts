// Global test setup. Silencia el logger para no ensuciar la salida.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'this-is-a-32-character-test-secret-value';
