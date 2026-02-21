import { redirect } from 'next/navigation';

export default function LearnModePage() {
  redirect('/play/jeopardy?method=learn');
}
