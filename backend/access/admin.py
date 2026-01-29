from django.contrib import admin
from .models import OdooModel

@admin.register(OdooModel)
class OdooModelAdmin(admin.ModelAdmin):
    list_display = ('model_name', 'description')
    search_fields = ('model_name', 'description')
    list_per_page = 100
