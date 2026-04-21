import Joi from 'joi';

export class ValidationService {
  /**
   * Validate lead form input
   */
  validateLeadForm(data: unknown): { valid: boolean; errors?: Record<string, string> } {
    const schema = Joi.object({
      nombre: Joi.string().required().min(2).max(100).messages({
        'string.empty': 'Nombre is required',
        'string.min': 'Nombre must be at least 2 characters',
      }),
      apellido: Joi.string().optional().max(100),
      email: Joi.string().email().required().max(255),
      telefono_whatsapp: Joi.string().optional().regex(/^52\d{10}$/).messages({
        'string.pattern.base': 'Phone must be in format: 5212345678',
      }),
      empresa: Joi.string().optional().max(150),
      puesto: Joi.string().optional().max(100),
      servicios: Joi.array().items(Joi.string()).optional(),
      origen: Joi.string().optional().valid('web', 'masterclass', 'referido'),
      notas: Joi.string().optional().max(500),
    });

    const { error } = schema.validate(data, { abortEarly: false });

    if (error) {
      const errors: Record<string, string> = {};
      error.details.forEach((detail) => {
        errors[detail.path.join('.')] = detail.message;
      });
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Validate email format and basic syntax
   */
  validateEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Validate Mexico phone number format
   */
  validatePhone(phone: string): boolean {
    // México phone format: 5212345678 (10 digits after country code)
    const phoneRegex = /^52\d{10}$/;
    return phoneRegex.test(phone);
  }

  /**
   * Validate appointment booking request
   */
  validateAppointmentBooking(data: unknown): { valid: boolean; errors?: Record<string, string> } {
    const schema = Joi.object({
      cliente_id: Joi.string().uuid().required(),
      consultor_id: Joi.string().uuid().required(),
      fecha_hora_inicio: Joi.string().isoDate().required(),
      fecha_hora_fin: Joi.string().isoDate().required(),
      notas_cliente: Joi.string().optional().max(500),
    }).custom((value, helpers) => {
      const startTime = new Date(value.fecha_hora_inicio);
      const endTime = new Date(value.fecha_hora_fin);

      if (startTime >= endTime) {
        return helpers.error('any.invalid');
      }

      if (endTime.getTime() - startTime.getTime() !== 15 * 60 * 1000) {
        return helpers.error('any.invalid');
      }

      return value;
    });

    const { error } = schema.validate(data, { abortEarly: false });

    if (error) {
      const errors: Record<string, string> = {};
      error.details.forEach((detail) => {
        if (detail.type === 'any.invalid') {
          errors['tiempo'] = 'End time must be exactly 15 minutes after start time';
        } else {
          errors[detail.path.join('.')] = detail.message;
        }
      });
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Validate qualification scoring
   */
  validateQualification(data: unknown): { valid: boolean; errors?: Record<string, string> } {
    const schema = Joi.object({
      cita_id: Joi.string().uuid().required(),
      resultado: Joi.string().valid('caliente', 'tibio', 'frio', 'no_aplica').required(),
      score_interes: Joi.string().valid('alto', 'medio', 'bajo').required(),
      notas_internas: Joi.string().optional().max(1000),
    });

    const { error } = schema.validate(data, { abortEarly: false });

    if (error) {
      const errors: Record<string, string> = {};
      error.details.forEach((detail) => {
        errors[detail.path.join('.')] = detail.message;
      });
      return { valid: false, errors };
    }

    return { valid: true };
  }

  /**
   * Validate login credentials
   */
  validateLoginCredentials(data: unknown): { valid: boolean; errors?: Record<string, string> } {
    const schema = Joi.object({
      email: Joi.string().email().required(),
      password: Joi.string().min(6).required(),
    });

    const { error } = schema.validate(data, { abortEarly: false });

    if (error) {
      const errors: Record<string, string> = {};
      error.details.forEach((detail) => {
        errors[detail.path.join('.')] = detail.message;
      });
      return { valid: false, errors };
    }

    return { valid: true };
  }
}

export const validationService = new ValidationService();
