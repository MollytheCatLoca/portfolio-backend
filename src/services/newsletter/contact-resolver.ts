import getPrismaClient from '../../config/database';
import { Contact } from './types';
import logger, { newsletterLogger } from '../../utils/logger';

/**
 * Get unique active contacts from distribution lists
 */
export async function getContactsFromLists(listIds: string[]): Promise<Contact[]> {
  try {
    newsletterLogger.info('Fetching contacts from distribution lists', { listIds });

    const prisma = getPrismaClient();

    const lists = await prisma.distribution_lists.findMany({
      where: {
        id: { in: listIds },
        activa: true,
      },
      include: {
        contacts: {
          include: {
            contact: {
              select: {
                id: true,
                nombre: true,
                apellido: true,
                email: true,
                activo: true,
              },
            },
          },
        },
      },
    });

    // Use Map for unique contacts by email
    const contactsMap = new Map<string, Contact>();

    lists.forEach((list) => {
      list.contacts.forEach((dlc) => {
        if (dlc.contact.activo && dlc.contact.email) {
          contactsMap.set(dlc.contact.email, {
            id: dlc.contact.id,
            nombre: dlc.contact.nombre,
            apellido: dlc.contact.apellido,
            email: dlc.contact.email,
            activo: dlc.contact.activo,
          });
        }
      });
    });

    const contacts = Array.from(contactsMap.values());

    newsletterLogger.info(`Found ${contacts.length} unique active contacts`);

    return contacts;
  } catch (error) {
    logger.error('Error fetching contacts from lists:', error);
    throw new Error('Failed to fetch contacts from distribution lists');
  }
}

/**
 * Validate email address format
 */
export function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Filter and validate contacts
 */
export function validateContacts(contacts: Contact[]): Contact[] {
  return contacts.filter((contact) => {
    if (!contact.email) {
      logger.warn('Contact missing email', { contactId: contact.id });
      return false;
    }

    if (!isValidEmail(contact.email)) {
      logger.warn('Invalid email format', { email: contact.email });
      return false;
    }

    return true;
  });
}
