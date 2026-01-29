from django.db import models

class OdooModel(models.Model):
    model_name = models.CharField(max_length=100, unique=True) # e.g. res.partner
    description = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        return f"{self.model_name} | {self.description or 'Açıklama Yok'}"

    class Meta:
        verbose_name = "Odoo Tablosu"
        verbose_name_plural = "Odoo Tabloları"
        ordering = ['model_name']
