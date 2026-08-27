import { SettingsForms } from '@/components/SettingsForms';
import { getHouse } from '@/lib/queries';
import { prisma } from '@/lib/db';

export default async function SettingsPage() {
  const house = await getHouse();

  const counts = {
    templates: await prisma.taskTemplate.count({ where: { active: true } }),
    occurrences: await prisma.taskOccurrence.count(),
    completed: await prisma.taskOccurrence.count({ where: { status: 'COMPLETED' } }),
  };

  return <SettingsForms house={house} counts={counts} />;
}
