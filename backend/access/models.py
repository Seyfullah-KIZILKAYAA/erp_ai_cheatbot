from django.db import models
from django.contrib.auth.models import User
from django.db.models.signals import post_save
from django.dispatch import receiver

class OdooModel(models.Model):
    model_name = models.CharField(max_length=100, unique=True) # e.g. res.partner
    description = models.CharField(max_length=255, blank=True, null=True)

    def __str__(self):
        # Description ekleyerek aramayı ve seçimi kolaylaştırıyoruz
        return f"{self.model_name} | {self.description or 'Açıklama Yok'}"

    class Meta:
        verbose_name = "Odoo Tablosu"
        verbose_name_plural = "Odoo Tabloları"
        ordering = ['model_name']

class Role(models.Model):
    name = models.CharField(max_length=50, unique=True)
    description = models.TextField(blank=True)
    # ManyToManyField kullanarak toplu seçimi ve aramayı aktif ediyoruz
    allowed_models = models.ManyToManyField(OdooModel, blank=True, verbose_name="Erişebilir Tablolar")

    def __str__(self):
        return self.name

class Profile(models.Model):
    user = models.OneToOneField(User, on_delete=models.CASCADE)
    role = models.ForeignKey(Role, on_delete=models.SET_NULL, null=True, blank=True)

    def __str__(self):
        return f"{self.user.username} ({self.role.name if self.role else 'No Role'})"

@receiver(post_save, sender=User)
def create_user_profile(sender, instance, created, **kwargs):
    if created:
        Profile.objects.create(user=instance)

@receiver(post_save, sender=User)
def save_user_profile(sender, instance, **kwargs):
    instance.profile.save()
