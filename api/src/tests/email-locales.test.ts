import {describe,it,expect} from 'vitest';
import {buildPasswordResetHtml,buildPasswordResetText} from '../lib/email';
describe('password reset email localization',()=>{
 const input={to:'test@example.invalid',displayName:'Name <script>',resetUrl:'https://example.invalid/reset?token=abc&next=1'};
 it('defaults to English and escapes HTML without changing reset URLs',()=>{
  const html=buildPasswordResetHtml(input),plain=buildPasswordResetText(input);
  expect(html).toContain('<html lang="en">');expect(html).toContain('Reset password');
  expect(html).toContain('Name &lt;script&gt;');expect(html).toContain('token=abc&amp;next=1');
  expect(html).not.toContain('contraseña');expect(plain).toContain(input.resetUrl);
  expect(plain).toContain('Hello Name <script>,');
 });
 it('keeps the optional Spanish version',()=>{
  expect(buildPasswordResetHtml({...input,locale:'es'})).toContain('<html lang="es">');
  expect(buildPasswordResetText({...input,locale:'es'})).toContain('Hola Name <script>,');
 });
});
