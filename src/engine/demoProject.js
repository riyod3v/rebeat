import brazilianFunkProject from '../projects/brazilianFunkProject.json';
import { normalizeProject } from './ProjectLoader';

export function getDemoProject() {
  return normalizeProject(brazilianFunkProject);
}
