import { z } from 'zod'
import { request } from './auth'

const attribute = z.object({ name: z.string(), value: z.string() })
const quantity = z.string().regex(/^(0|[1-9][0-9]{0,9})(\.[0-9]{1,6})?$/).refine((value) => Number(value) > 0 && Number(value) <= 1_000_000_000)
const ingredientInput = z.object({ product_id: z.uuid(), base_unit: z.string().min(1).max(80), quantity })
export const recipeSnapshotSchema = z.object({
  id: z.uuid(), version: z.number().int().positive(),
  ingredients: z.array(ingredientInput.extend({ name: z.string(), sku: z.string(), cost_vnd: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER).nullable() })).min(1),
})
export const recipeSchema = recipeSnapshotSchema.extend({ unit: z.string(), attributes: z.array(attribute) })
export const recipeInputSchema = z.object({
  unit: z.string().trim().min(1).max(80), version: z.number().int().nonnegative(), attributes: z.array(attribute).max(20),
  ingredients: z.array(ingredientInput).min(1).max(100),
}).refine((value) => new Set(value.ingredients.map((i) => i.product_id)).size === value.ingredients.length, { message: 'Không được trùng nguyên liệu.' })
export type RecipeDTO = z.infer<typeof recipeSchema>
export type RecipeSnapshot = z.infer<typeof recipeSnapshotSchema>
export const recipesRepository = {
  list: (id: string, signal?: AbortSignal) => request(`/products/${z.uuid().parse(id)}/recipes`, z.array(recipeSchema), { signal }),
  save: (id: string, input: z.infer<typeof recipeInputSchema>, key: string) => request(`/products/${z.uuid().parse(id)}/recipes`, recipeSchema, { method: 'PUT', body: recipeInputSchema.parse(input), idempotencyKey: key }),
}
function attributesKey(values: { name: string; value: string }[]) {
  return JSON.stringify([...values].sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : 0).map((a) => [a.name, a.value]))
}
export function selectRecipe(recipes: RecipeDTO[], unit: string, attributes: { name: string; value: string }[]): RecipeDTO | undefined {
  return recipes.find((r) => r.unit === unit && attributesKey(r.attributes) === attributesKey(attributes))
    ?? recipes.find((r) => r.unit === unit && !r.attributes.length)
}
