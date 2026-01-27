const authService = require('../services/auth');

class AuthController {
  /**
   * PUBLIC_INTERFACE
   * Register a new user and create an initial organization.
   */
  async register(req, res) {
    const result = await authService.register(req.body || {});
    return res.status(201).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Login using email/password.
   */
  async login(req, res) {
    const result = await authService.login(req.body || {});
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Refresh access token using refresh token.
   */
  async refresh(req, res) {
    const result = await authService.refresh(req.body || {});
    return res.status(200).json(result);
  }

  /**
   * PUBLIC_INTERFACE
   * Logout (stateless placeholder).
   */
  async logout(req, res) {
    const result = await authService.logout();
    return res.status(200).json(result);
  }
}

module.exports = new AuthController();
