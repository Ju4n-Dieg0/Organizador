import { Navigate } from 'react-router-dom';
import { Button, Form, Input, Typography } from 'antd';
import { LockOutlined, MailOutlined } from '@ant-design/icons';
import { motion, useReducedMotion } from 'framer-motion';
import { AppBackground } from '../components/layout/AppBackground';
import { getStoredToken, useAuth } from '../hooks/useAuth';
import { ROUTES } from '../constants/routes';
import { colors, motionTokens, radii, shadows } from '../theme';
import type { LoginRequest } from '../types/auth.types';

export function LoginPage() {
  const { login, isLoggingIn } = useAuth();
  const reducedMotion = useReducedMotion();

  if (getStoredToken()) {
    return <Navigate to={ROUTES.dashboard} replace />;
  }

  return (
    <div
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <AppBackground />
      <motion.div
        initial={reducedMotion ? false : { opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: motionTokens.enter, ease: motionTokens.ease }}
        style={{ position: 'relative', zIndex: 1, width: '100%', maxWidth: 400 }}
      >
        {/* Doble bisel: shell exterior + card glass interior (página fija: blur permitido) */}
        <div
          style={{
            background: colors.surfaceShell,
            border: `1px solid ${colors.borderGlass}`,
            borderRadius: radii.shell + 4,
            padding: 6,
          }}
        >
          <div
            style={{
              background: colors.surfaceGlass,
              border: `1px solid ${colors.borderGlass}`,
              borderRadius: radii.shell - 2,
              boxShadow: shadows.glassInset,
              backdropFilter: 'blur(16px)',
              WebkitBackdropFilter: 'blur(16px)',
              padding: '36px 32px 32px',
            }}
          >
            <div style={{ textAlign: 'center', marginBottom: 28 }}>
              <div
                style={{
                  fontSize: 11,
                  fontWeight: 600,
                  textTransform: 'uppercase',
                  letterSpacing: '0.2em',
                  color: colors.textMuted,
                  marginBottom: 10,
                }}
              >
                To Grow Agencia
              </div>
              <h1
                style={{
                  margin: 0,
                  fontSize: 30,
                  fontWeight: 800,
                  letterSpacing: '-0.02em',
                  color: colors.text,
                  lineHeight: 1.1,
                }}
              >
                Organizador
                <span style={{ color: colors.accent }}>.</span>
              </h1>
              <Typography.Text type="secondary" style={{ display: 'block', marginTop: 8 }}>
                Inicia sesión para continuar
              </Typography.Text>
            </div>

            <Form<LoginRequest>
              layout="vertical"
              onFinish={(values) => login(values)}
              requiredMark={false}
            >
              <Form.Item
                name="email"
                label="Correo electrónico"
                rules={[
                  { required: true, message: 'El correo es obligatorio' },
                  { type: 'email', message: 'Debe ser un correo válido' },
                ]}
              >
                <Input
                  prefix={<MailOutlined aria-hidden style={{ color: colors.textMuted }} />}
                  placeholder="correo@empresa.com"
                  autoComplete="email"
                  size="large"
                />
              </Form.Item>
              <Form.Item
                name="password"
                label="Contraseña"
                rules={[{ required: true, message: 'La contraseña es obligatoria' }]}
              >
                <Input.Password
                  prefix={<LockOutlined aria-hidden style={{ color: colors.textMuted }} />}
                  placeholder="Tu contraseña"
                  autoComplete="current-password"
                  size="large"
                />
              </Form.Item>
              <Form.Item style={{ marginBottom: 0, marginTop: 24 }}>
                <Button
                  type="primary"
                  htmlType="submit"
                  block
                  size="large"
                  loading={isLoggingIn}
                  style={{ height: 46, fontWeight: 600 }}
                >
                  Iniciar sesión
                </Button>
              </Form.Item>
            </Form>
          </div>
        </div>
      </motion.div>
    </div>
  );
}
