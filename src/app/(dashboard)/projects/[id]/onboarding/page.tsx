import { redirect } from 'next/navigation';

// Esta ruta redirige al nuevo proyecto
export default async function OnboardingPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(`/projects/${id}`);
}
