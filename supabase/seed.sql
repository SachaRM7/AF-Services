-- Données initiales : catégories et prestations (tarifs provisoires, modifiables dans l'administration).
-- Ajoutez ensuite les deux adresses administrateurs :
--   insert into public.admin_allowlist (email, full_name) values ('adel@exemple.fr', 'Adel Ferchichi'), ('admin@exemple.fr', '...');

insert into public.service_categories (slug, name, audience, summary, form_kind, sort_order) values
  ('vitrerie-particuliers', 'Vitrerie pour particuliers', 'particuliers',
   'Fenêtres, portes-fenêtres, baies vitrées, vérandas accessibles et autres surfaces vitrées.', 'vitrerie', 1),
  ('vitrines-commerces', 'Vitrines et commerces', 'professionnels',
   'Nettoyage des vitrines commerciales et des surfaces vitrées professionnelles.', 'vitrerie', 2),
  ('bureaux', 'Bureaux et locaux professionnels', 'professionnels',
   'Sols, surfaces, mobilier, poubelles, espaces de travail et entretien courant.', 'surfaces', 3),
  ('sanitaires', 'Sanitaires', 'tous',
   'WC, lavabos, miroirs, robinetterie, sols et surfaces de contact.', 'sanitaires', 4),
  ('parties-communes', 'Parties communes et copropriétés', 'professionnels',
   'Halls, escaliers, paliers et espaces communs.', 'surfaces', 5),
  ('apres-demenagement', 'Nettoyage après déménagement', 'tous',
   'Nettoyage de logements ou de locaux libérés.', 'surfaces', 6),
  ('apres-travaux', 'Remise en état après travaux légers', 'tous',
   'Dépoussiérage et nettoyage approfondi après de petits travaux.', 'surfaces', 7)
on conflict (slug) do nothing;

insert into public.services (category_id, name, description, unit, unit_price_cents, sort_order)
select c.id, v.name, v.description, v.unit, v.price, v.sort
from (values
  ('vitrerie-particuliers', 'Nettoyage de vitres (particuliers)', 'Vitres intérieures et extérieures accessibles, cadres et rebords.', 'm2', 300, 1),
  ('vitrines-commerces', 'Nettoyage de vitrines', 'Vitrines et surfaces vitrées commerciales accessibles depuis le sol.', 'm2', 400, 1),
  ('bureaux', 'Entretien de bureaux', 'Dépoussiérage, sols, poubelles, points de contact.', 'heure', 3000, 1),
  ('sanitaires', 'Nettoyage de sanitaires', 'WC, lavabos, miroirs, robinetterie, sols.', 'heure', 3000, 1),
  ('parties-communes', 'Entretien des parties communes', 'Halls, escaliers, paliers.', 'heure', 3000, 1),
  ('apres-demenagement', 'Nettoyage après déménagement', 'Remise en propreté complète d''un logement ou local vide.', 'heure', 3500, 1),
  ('apres-travaux', 'Remise en état après travaux légers', 'Dépoussiérage et nettoyage approfondi.', 'heure', 4000, 1)
) as v(slug, name, description, unit, price, sort)
join public.service_categories c on c.slug = v.slug
where not exists (select 1 from public.services s where s.name = v.name);

insert into public.services (category_id, name, description, unit, unit_price_cents, active, requires_special_equipment, constraints_text, sort_order)
select c.id, 'Vitrerie en hauteur (> 3 m)', 'Nécessite perche à eau pure ou nacelle : non réalisable avec l''équipement actuel.', 'm2', 600,
       false, true, 'Matériel spécialisé requis (perche télescopique, nacelle). Validation manuelle obligatoire.', 9
from public.service_categories c
where c.slug = 'vitrines-commerces'
  and not exists (select 1 from public.services s where s.name = 'Vitrerie en hauteur (> 3 m)');
