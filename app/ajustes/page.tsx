import { SettingsForms } from '@/components/SettingsForms';
import { getHouse } from '@/lib/queries';
import { prisma } from '@/lib/db';

export default async function SettingsPage() {
  const house = await getHouse();

  const counts = {
    templates: await prisma.taskTemplate.count({ where: { active: true } }),
    occurrences: await prisma.taskOccurrence.count({ where: { deletedAt: null } }),
    completed: await prisma.taskOccurrence.count({
      where: { status: 'COMPLETED', deletedAt: null },
    }),
  };

  return <SettingsForms house={house} counts={counts} />;
}
