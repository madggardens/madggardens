import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { format } from 'prettier';
import { z } from 'zod';
import { createDocument } from 'zod-openapi';

import { currentUserResponseSchema, deleteAccountResponseSchema } from '../shared/contracts/auth';
import { apiErrorResponseSchema } from '../shared/contracts/errors';
import {
  adminGardenListRequestSchema,
  adminGardenListResponseSchema,
  createGardenRequestSchema,
  createGardenResponseSchema,
  gardenDetailResponseSchema,
  gardenIdParamsSchema,
  gardenListRequestSchema,
  gardenListResponseSchema,
  ownerGardenListRequestSchema,
  ownerGardenListResponseSchema,
  moderateGardenRequestSchema,
  moderateGardenResponseSchema,
  signUploadRequestSchema,
  signUploadResponseSchema,
  updateGardenRequestSchema,
  updateGardenResponseSchema,
} from '../shared/contracts/gardens';
import { healthResponseSchema, readinessResponseSchema } from '../shared/contracts/health';

const document = createDocument({
  openapi: '3.1.0',
  info: {
    title: 'Guerrilla Gardens Madrid API',
    version: '0.1.0',
  },
  paths: {
    '/api/health': {
      get: {
        summary: 'Comprueba que el proceso de la API responde',
        responses: {
          '200': {
            description: 'API disponible',
            content: { 'application/json': { schema: healthResponseSchema } },
          },
        },
      },
    },
    '/api/ready': {
      get: {
        summary: 'Comprueba de forma protegida la conexión con base de datos y Storage',
        security: [{ serviceBearerAuth: [] }],
        responses: {
          '200': {
            description: 'API y dependencias disponibles',
            content: { 'application/json': { schema: readinessResponseSchema } },
          },
          '401': {
            description: 'Secreto de monitorización ausente o no válido',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '500': {
            description: 'Alguna dependencia no está disponible',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/auth/me': {
      get: {
        summary: 'Valida la sesión y devuelve el usuario actual',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Usuario autenticado',
            content: { 'application/json': { schema: currentUserResponseSchema } },
          },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '500': {
            description: 'Error interno neutralizado',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/account': {
      delete: {
        summary: 'Elimina la cuenta y sus datos privados; anonimiza jardines aprobados',
        security: [{ bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Cuenta eliminada',
            content: { 'application/json': { schema: deleteAccountResponseSchema } },
          },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '429': {
            description: 'Demasiados intentos',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '500': {
            description: 'El borrado no se pudo completar y puede reintentarse',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/gardens': {
      get: {
        summary: 'Lista jardines aprobados dentro del área visible',
        requestParams: { query: gardenListRequestSchema },
        responses: {
          '200': {
            description: 'Jardines aprobados ordenados mediante cursor estable',
            content: { 'application/json': { schema: gardenListResponseSchema } },
          },
          '400': {
            description: 'Viewport, filtro o cursor no válido',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '500': {
            description: 'Error interno neutralizado',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
      post: {
        summary: 'Crea una propuesta pendiente con fotografías privadas ya subidas',
        security: [{ bearerAuth: [] }],
        requestParams: {
          header: z.object({ 'Idempotency-Key': z.uuid() }),
        },
        requestBody: {
          content: { 'application/json': { schema: createGardenRequestSchema } },
        },
        responses: {
          '201': {
            description: 'Propuesta creada o respuesta idempotente recuperada',
            content: { 'application/json': { schema: createGardenResponseSchema } },
          },
          '400': {
            description: 'Cuerpo o clave de idempotencia no válidos',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '409': {
            description:
              'Fotos inválidas, ubicación fuera de Madrid, demasiado próxima o conflicto idempotente',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/uploads/sign': {
      post: {
        summary: 'Reserva una fotografía privada y devuelve un token de subida',
        security: [{ bearerAuth: [] }],
        requestBody: {
          content: { 'application/json': { schema: signUploadRequestSchema } },
        },
        responses: {
          '200': {
            description: 'Ruta privada y token de subida temporal',
            content: { 'application/json': { schema: signUploadResponseSchema } },
          },
          '400': {
            description: 'Metadatos de fichero no válidos',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/me/gardens': {
      get: {
        summary: 'Lista las propuestas activas del usuario actual',
        security: [{ bearerAuth: [] }],
        requestParams: { query: ownerGardenListRequestSchema },
        responses: {
          '200': {
            description: 'Propuestas propias con su estado de moderación',
            content: { 'application/json': { schema: ownerGardenListResponseSchema } },
          },
          '400': {
            description: 'Filtros o cursor no válidos',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/admin/gardens': {
      get: {
        summary: 'Lista la cola de moderación',
        security: [{ bearerAuth: [] }],
        requestParams: { query: adminGardenListRequestSchema },
        responses: {
          '200': {
            description: 'Propuestas filtradas por moderación',
            content: { 'application/json': { schema: adminGardenListResponseSchema } },
          },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '403': {
            description: 'El usuario no es administrador',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/admin/gardens/{id}/moderation': {
      patch: {
        summary: 'Aprueba y procesa imágenes o rechaza una propuesta',
        security: [{ bearerAuth: [] }],
        requestParams: { path: gardenIdParamsSchema },
        requestBody: {
          content: { 'application/json': { schema: moderateGardenRequestSchema } },
        },
        responses: {
          '200': {
            description: 'Propuesta moderada',
            content: { 'application/json': { schema: moderateGardenResponseSchema } },
          },
          '400': {
            description: 'Petición de moderación no válida',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '403': {
            description: 'El usuario no es administrador',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '409': {
            description: 'La propuesta ya no está pendiente',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '422': {
            description: 'Las imágenes no se pudieron procesar; la propuesta sigue pendiente',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
    '/api/gardens/{id}': {
      get: {
        summary: 'Devuelve un jardín visible para el usuario actual',
        requestParams: { path: gardenIdParamsSchema },
        security: [{}, { bearerAuth: [] }],
        responses: {
          '200': {
            description: 'Detalle del jardín',
            content: { 'application/json': { schema: gardenDetailResponseSchema } },
          },
          '400': {
            description: 'Identificador no válido',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '401': {
            description: 'Token opcional presente pero no válido',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '404': {
            description: 'Jardín inexistente o no visible',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
      patch: {
        summary: 'Edita una propuesta propia y restablece su moderación',
        security: [{ bearerAuth: [] }],
        requestParams: { path: gardenIdParamsSchema },
        requestBody: {
          content: { 'application/json': { schema: updateGardenRequestSchema } },
        },
        responses: {
          '200': {
            description: 'Propuesta actualizada y devuelta a pendiente',
            content: { 'application/json': { schema: updateGardenResponseSchema } },
          },
          '400': {
            description: 'Identificador o cuerpo no válido',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '404': {
            description: 'Jardín inexistente o no perteneciente al usuario',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '409': {
            description: 'Ubicación fuera de Madrid o demasiado próxima',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
      delete: {
        summary: 'Realiza el borrado lógico de una propuesta propia',
        security: [{ bearerAuth: [] }],
        requestParams: { path: gardenIdParamsSchema },
        responses: {
          '204': { description: 'Propuesta eliminada' },
          '401': {
            description: 'Sesión ausente, inválida o caducada',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
          '404': {
            description: 'Jardín inexistente o no perteneciente al usuario',
            content: { 'application/json': { schema: apiErrorResponseSchema } },
          },
        },
      },
    },
  },
  components: {
    securitySchemes: {
      bearerAuth: {
        type: 'http',
        scheme: 'bearer',
        bearerFormat: 'JWT',
      },
      serviceBearerAuth: {
        type: 'http',
        scheme: 'bearer',
        description: 'Secreto exclusivo de monitorización; no es un token de usuario.',
      },
    },
  },
});

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const outputPath = resolve(projectRoot, 'docs/openapi.json');
const contents = await format(JSON.stringify(document), {
  parser: 'json',
  printWidth: 100,
});

if (process.argv.includes('--check')) {
  let existing = '';
  try {
    existing = await readFile(outputPath, 'utf8');
  } catch {
    // Report the same actionable error for a missing or unreadable artifact.
  }

  if (existing !== contents) {
    throw new Error('docs/openapi.json is outdated. Run npm run generate:openapi.');
  }

  process.stdout.write('OpenAPI artifact is up to date.\n');
} else {
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, contents, 'utf8');
  process.stdout.write('Generated docs/openapi.json.\n');
}
