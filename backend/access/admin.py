from django.contrib import admin
from django import forms
from django.shortcuts import render
from django.http import HttpResponseRedirect
from .models import Role, Profile, OdooModel

# Custom widget for searchable checkbox list
class SearchableCheckboxSelectMultiple(forms.CheckboxSelectMultiple):
    template_name = 'admin/widgets/searchable_checkbox_list.html'

# 1. Odoo Tabloları için Toplu Yetki Verme Aksiyonu
@admin.action(description='Seçili tabloları bir Role ata')
def assign_to_role(modeladmin, request, queryset):
    if 'apply' in request.POST:
        role_id = request.POST.get('role_id')
        if role_id:
            role = Role.objects.get(id=role_id)
            role.allowed_models.add(*queryset)
            modeladmin.message_user(request, f"{queryset.count()} tablo başarıyla {role.name} rolüne eklendi.")
            return HttpResponseRedirect(request.get_full_path())

    roles = Role.objects.all()
    return render(request, 'admin/assign_role_intermediate.html', {
        'items': queryset,
        'roles': roles,
        'action': 'assign_to_role'
    })

@admin.action(description='Seçili tabloların yetkisini bir Rol\'den kaldır')
def remove_from_role(modeladmin, request, queryset):
    if 'apply' in request.POST:
        role_id = request.POST.get('role_id')
        if role_id:
            role = Role.objects.get(id=role_id)
            role.allowed_models.remove(*queryset)
            modeladmin.message_user(request, f"{queryset.count()} tablo {role.name} rolünden kaldırıldı.")
            return HttpResponseRedirect(request.get_full_path())

    roles = Role.objects.all()
    return render(request, 'admin/assign_role_intermediate.html', {
        'items': queryset,
        'roles': roles,
        'action': 'remove_from_role'
    })

@admin.register(OdooModel)
class OdooModelAdmin(admin.ModelAdmin):
    list_display = ('model_name', 'description')
    search_fields = ('model_name', 'description')
    list_per_page = 100
    actions = [assign_to_role, remove_from_role]

# 2. Rol düzenleme - Checkbox listesi ile
class RoleAdminForm(forms.ModelForm):
    class Meta:
        model = Role
        fields = '__all__'
        widgets = {
            'allowed_models': SearchableCheckboxSelectMultiple(),
        }

@admin.register(Role)
class RoleAdmin(admin.ModelAdmin):
    form = RoleAdminForm
    list_display = ('name', 'description', 'get_table_count')
    search_fields = ('name',)
    
    def get_table_count(self, obj):
        return obj.allowed_models.count()
    get_table_count.short_description = 'Yetkili Tablo Sayısı'

# 3. Profile Admin - Popup'ı JavaScript ile engelle
@admin.register(Profile)
class ProfileAdmin(admin.ModelAdmin):
    list_display = ('user', 'role')
    list_filter = ('role',)
    search_fields = ('user__username',)
    
    class Media:
        js = ('admin/js/disable_popups.js',)
