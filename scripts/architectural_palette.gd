extends RefCounted
## One original PBR palette shared by all texture-free celestial GLBs.

static var _shared: Dictionary = {}


static func material_for(label: String) -> StandardMaterial3D:
	var key := label.get_slice(".", 0)
	if _shared.has(key):
		return _shared[key]
	var surface := StandardMaterial3D.new()
	surface.resource_name = "Celestial" + key
	surface.roughness = 0.78
	surface.texture_filter = BaseMaterial3D.TEXTURE_FILTER_LINEAR_WITH_MIPMAPS_ANISOTROPIC
	match key:
		"Stone":
			_textures(surface, "stone", 0.65)
		"Timber":
			_textures(surface, "timber", 0.42)
		"Roof":
			_textures(surface, "roof", 0.72)
		"Gold":
			surface.albedo_color = Color("c0a25b")
			surface.metallic = 0.52
			surface.roughness = 0.35
		"Jade":
			surface.albedo_color = Color("547a70")
			surface.roughness = 0.32
			surface.metallic = 0.12
		"Paper":
			surface.albedo_color = Color("ffe0a5")
			surface.emission_enabled = true
			surface.emission = Color("e8a951")
			surface.emission_energy_multiplier = 0.20
			surface.cull_mode = BaseMaterial3D.CULL_DISABLED
		"Cloth":
			surface.albedo_color = Color("922f35")
			surface.roughness = 0.92
			surface.cull_mode = BaseMaterial3D.CULL_DISABLED
		_:
			surface.albedo_color = Color("989e8a")
	_shared[key] = surface
	return surface


static func _textures(surface: StandardMaterial3D, stem: String, strength: float) -> void:
	var base := "res://assets/materials/temple_%s_original" % stem
	surface.albedo_texture = load(base + ".png")
	surface.normal_enabled = true
	surface.normal_texture = load(base + "_normal.png")
	surface.normal_scale = strength
	surface.roughness_texture = load(base + "_roughness.png")
	surface.roughness_texture_channel = BaseMaterial3D.TEXTURE_CHANNEL_GREEN


static func replace_surface_materials(item: MeshInstance3D) -> void:
	if item.mesh == null:
		return
	for index in range(item.mesh.get_surface_count()):
		var original := item.mesh.surface_get_material(index)
		if original != null:
			item.set_surface_override_material(index, material_for(original.resource_name))


static func apply(model: Node3D) -> void:
	if model is MeshInstance3D:
		replace_surface_materials(model)
	for item in model.find_children("*", "MeshInstance3D", true, false):
		replace_surface_materials(item)
