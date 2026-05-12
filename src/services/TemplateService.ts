import { promises as fs } from 'fs';
import path from 'path';
import { getDatabase } from '../config/database';
import { logger } from '../config/logger';
import { Plantilla, AppError } from '../types';

// Templates shipped with the repo. Used as the default source so every
// developer gets the latest design after `git pull` (no DB seed required).
// Existing DB rows in PLANTILLAS only act as overrides — see resolveTemplate.
const TEMPLATES_DIR = path.resolve(__dirname, '..', 'templates');

const FILE_EXTENSIONS: Record<string, string> = {
  email: '.html',
  whatsapp: '.txt',
};

async function readTemplateFile(
  canal: 'email' | 'whatsapp',
  tipoEvento: string
): Promise<string | null> {
  const ext = FILE_EXTENSIONS[canal] || '.txt';
  const file = path.join(TEMPLATES_DIR, canal, `${tipoEvento}${ext}`);
  try {
    return await fs.readFile(file, 'utf8');
  } catch {
    return null;
  }
}

export class TemplateService {
  /**
   * Load template from database
   */
  async getTemplate(
    canal: 'email' | 'whatsapp',
    tipoEvento: string
  ): Promise<Plantilla | null> {
    try {
      const pool = await getDatabase();

      const [rows] = await pool.execute(
        `SELECT * FROM PLANTILLAS
         WHERE canal = ? AND tipo_evento = ? AND activa = 1
         LIMIT 1`,
        [canal, tipoEvento]
      );

      if (Array.isArray(rows) && rows.length > 0) {
        return rows[0] as Plantilla;
      }

      return null;
    } catch (error) {
      logger.error('Error loading template:', error);
      throw error;
    }
  }

  /**
   * Substitute variables in template string
   * Variables are in format: {{variable_name}}
   */
  renderTemplate(template: string, variables: Record<string, string>): string {
    let rendered = template;

    Object.entries(variables).forEach(([key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      rendered = rendered.replace(regex, value || '');
    });

    return rendered;
  }

  /**
   * Resolve template content. File-based templates (src/templates/) take
   * precedence so the design always matches the deployed code. The database
   * is only consulted as a fallback (legacy behavior / runtime overrides).
   */
  private async resolveTemplate(
    canal: 'email' | 'whatsapp',
    tipoEvento: string
  ): Promise<string | null> {
    const fileContent = await readTemplateFile(canal, tipoEvento);
    if (fileContent) {
      return fileContent;
    }

    const dbTemplate = await this.getTemplate(canal, tipoEvento);
    if (dbTemplate) {
      logger.warn(
        `No file template for ${canal}/${tipoEvento}; falling back to DB row`
      );
      return dbTemplate.contenido;
    }

    return null;
  }

  /**
   * Render a template (file first, DB as fallback) with variable substitution.
   */
  async renderFromDatabase(
    canal: 'email' | 'whatsapp',
    tipoEvento: string,
    variables: Record<string, string>
  ): Promise<string> {
    try {
      const content = await this.resolveTemplate(canal, tipoEvento);

      if (!content) {
        throw new AppError(
          `Template not found: ${canal}/${tipoEvento}`,
          500,
          'TEMPLATE_NOT_FOUND'
        );
      }

      return this.renderTemplate(content, variables);
    } catch (error) {
      logger.error('Error rendering template:', error);
      throw error;
    }
  }

  /**
   * Get all template variables from a template string
   */
  extractVariables(template: string): string[] {
    const regex = /{{(\w+)}}/g;
    const variables: string[] = [];
    let match;

    while ((match = regex.exec(template)) !== null) {
      if (!variables.includes(match[1])) {
        variables.push(match[1]);
      }
    }

    return variables;
  }

  /**
   * Validate that all required variables are provided
   */
  validateVariables(
    template: string,
    providedVariables: Record<string, any>
  ): { valid: boolean; missing: string[] } {
    const required = this.extractVariables(template);
    const provided = Object.keys(providedVariables);
    const missing = required.filter(v => !provided.includes(v));

    return {
      valid: missing.length === 0,
      missing,
    };
  }

  /**
   * Create or update a template
   */
  async upsertTemplate(
    canal: 'email' | 'whatsapp',
    tipoEvento: string,
    nombre: string,
    contenido: string
  ): Promise<Plantilla> {
    try {
      const pool = await getDatabase();
      const { v4: uuidv4 } = await import('uuid');

      // Check if template exists
      const [existing] = await pool.execute(
        `SELECT id FROM PLANTILLAS
         WHERE canal = ? AND tipo_evento = ?`,
        [canal, tipoEvento]
      );

      if (Array.isArray(existing) && existing.length > 0) {
        // Update existing
        await pool.execute(
          `UPDATE PLANTILLAS
           SET nombre = ?, contenido = ?
           WHERE canal = ? AND tipo_evento = ?`,
          [nombre, contenido, canal, tipoEvento]
        );

        logger.info(`Template updated: ${canal}/${tipoEvento}`);
      } else {
        // Create new
        const id = uuidv4();
        await pool.execute(
          `INSERT INTO PLANTILLAS (id, canal, tipo_evento, nombre, contenido, activa)
           VALUES (?, ?, ?, ?, ?, 1)`,
          [id, canal, tipoEvento, nombre, contenido]
        );

        logger.info(`Template created: ${canal}/${tipoEvento}`);
      }

      const template = await this.getTemplate(canal, tipoEvento);
      if (!template) {
        throw new AppError('Template not found after creation', 500);
      }

      return template;
    } catch (error) {
      logger.error('Error upserting template:', error);
      throw error;
    }
  }
}

export const templateService = new TemplateService();
